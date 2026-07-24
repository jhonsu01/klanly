import { z } from "zod";
import { db } from "@/db";
import { communities, memberships, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
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
