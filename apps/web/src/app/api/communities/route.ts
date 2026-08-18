import { z } from "zod";
import { db } from "@/db";
import { communities, memberships, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail, slugify } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Listado público (discover)
export async function GET() {
  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      description: communities.description,
      iconUrl: communities.iconUrl,
      priceCents: communities.priceCents,
      currency: communities.currency,
      billingPeriod: communities.billingPeriod,
    })
    .from(communities)
    .where(eq(communities.isPublic, true))
    .orderBy(desc(communities.createdAt))
    .limit(100);
  return ok(rows);
}

const Body = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  priceCents: z.number().int().min(0).default(0),
  currency: z.string().default("USD"),
  billingPeriod: z.enum(["free", "month", "year", "one_time"]).default("free"),
});

// Crear comunidad (el usuario pasa a ser PRODUCTOR y owner)
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (!me.emailVerified) return fail("Verifica tu correo para continuar.", 403, { needsVerify: true });

  /* Cada comunidad se paga y se aprueba por separado.
     Antes bastaba UN pago para abrir comunidades sin limite mientras durara la
     vigencia. Ahora cada aprobacion del admin suma un cupo (`communityQuota`) y
     publicar consume uno: el cobro se corresponde con lo que se entrega. */
  if (me.platformRole !== "admin") {
    const expirado = me.producerAccessUntil && new Date(me.producerAccessUntil).getTime() <= Date.now();
    if (expirado) {
      return fail("Tu acceso de productor venció. Renueva tu plan.", 403,
        { needsProducer: true, producerStatus: me.producerStatus, expired: true });
    }

    const [{ propias }] = await db
      .select({ propias: sql<number>`count(*)::int` })
      .from(communities)
      .where(eq(communities.ownerId, me.id));

    if (propias >= me.communityQuota) {
      const yaFueAprobado = me.communityQuota > 0 || propias > 0;
      return fail(
        me.producerStatus === "pending"
          ? "Tu solicitud está en revisión. El administrador la aprobará cuando verifique el pago."
          : yaFueAprobado
            ? `Cada comunidad se paga por separado. Ya usaste tu cupo (${propias} de ${me.communityQuota}): envía una solicitud nueva con su comprobante y el administrador la aprueba.`
            : "Debes ser productor aprobado para publicar. Aplica desde tu cuenta.",
        403,
        {
          needsProducer: true, producerStatus: me.producerStatus, expired: false,
          quota: me.communityQuota, owned: propias,
        },
      );
    }
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422, { issues: parsed.error.issues });
  const b = parsed.data;

  const base = slugify(b.name) || "comunidad";
  const slug = `${base}-${Math.floor(100 + Math.random() * 900)}`;
  const billingPeriod = b.priceCents > 0 ? (b.billingPeriod === "free" ? "month" : b.billingPeriod) : "free";

  const [c] = await db
    .insert(communities)
    .values({
      slug,
      name: b.name,
      description: b.description,
      ownerId: me.id,
      priceCents: b.priceCents,
      currency: b.currency,
      billingPeriod,
    })
    .returning();

  // El creador queda como owner con membresía activa
  await db.insert(memberships).values({
    communityId: c.id,
    userId: me.id,
    role: "owner",
    status: "active",
  });

  // Promueve el rol de plataforma a "producer" si aún era "user"
  if (me.platformRole === "user") {
    await db.update(users).set({ platformRole: "producer" }).where(eq(users.id, me.id));
  }

  return ok(c, 201);
}
