import { z } from "zod";
import { db } from "@/db";
import { communities, memberships, subscriptions, paymentOrders } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { ok, fail } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { verifyStepUp } from "@/lib/stepup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const [c] = await db.select().from(communities).where(eq(communities.slug, params.slug)).limit(1);
  if (!c) return fail("Comunidad no encontrada", 404);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.communityId, c.id));

  // Membresía del usuario actual (si está autenticado)
  let myMembership: { role: string; status: string; level: number; points: number; accessUntil: string | null } | null = null;
  const me = await currentUser();
  if (me) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.communityId, c.id), eq(memberships.userId, me.id)))
      .limit(1);
    if (m) {
      const [sub] = await db
        .select({ end: subscriptions.currentPeriodEnd })
        .from(subscriptions)
        .where(and(eq(subscriptions.communityId, c.id), eq(subscriptions.userId, me.id)))
        .limit(1);
      myMembership = { role: m.role, status: m.status, level: m.level, points: m.points, accessUntil: sub?.end ? new Date(sub.end).toISOString() : null };
    }
  }

  // Estado de la última orden del usuario (para el flujo de comprobante)
  let myOrderStatus: string | null = null;
  if (me) {
    const [o] = await db
      .select({ status: paymentOrders.status })
      .from(paymentOrders)
      .where(and(eq(paymentOrders.communityId, c.id), eq(paymentOrders.userId, me.id)))
      .orderBy(desc(paymentOrders.createdAt))
      .limit(1);
    myOrderStatus = o?.status ?? null;
  }

  return ok({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    iconUrl: c.iconUrl,
    priceCents: c.priceCents,
    currency: c.currency,
    billingPeriod: c.billingPeriod,
    isPublic: c.isPublic,
    affiliateEnabled: c.affiliateEnabled,
    affiliateCommissionPct: Number(c.affiliateCommissionPct),
    payoutTermsDays: c.payoutTermsDays,
    manualEnabled: c.manualEnabled,
    manualAccounts: c.manualAccounts ?? [],
    memberCount: count,
    myMembership,
    myOrderStatus,
  });
}

const PatchBody = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().url().optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.enum(["USD", "COP"]).optional(),
  billingPeriod: z.enum(["free", "month", "year", "one_time"]).optional(),
  isPublic: z.boolean().optional(),
  affiliateEnabled: z.boolean().optional(),
  affiliateCommissionPct: z.number().min(0).max(90).optional(),
  payoutTermsDays: z.union([z.literal(30), z.literal(60)]).optional(),
  manualEnabled: z.boolean().optional(),
  manualAccounts: z.array(z.object({
    bank: z.string().max(60),
    number: z.string().max(60),
    name: z.string().max(80),
  })).max(8).optional(),
  // `nullish` y no `optional`: el formulario manda `code: null` cuando NO hace
  // falta confirmar (primera vez que se ponen las cuentas). Con `optional` eso
  // era un fallo de validacion y el productor solo veia "Datos invalidos".
  code: z.string().min(6).max(6).nullish(), // step-up: requerido solo al CAMBIAR medios de pago
});

// Editar la comunidad (solo owner o admin de plataforma)
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [c] = await db.select().from(communities).where(eq(communities.slug, params.slug)).limit(1);
  if (!c) return fail("Comunidad no encontrada", 404);

  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, c.id), eq(memberships.userId, me.id)))
    .limit(1);
  const isOwner = m?.role === "owner" || me.platformRole === "admin";
  if (!isOwner) return fail("Solo el owner puede editar la comunidad", 403);

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // "Datos inválidos" a secas no le dice nada a nadie: hay que nombrar el campo.
    const campos = [...new Set(parsed.error.issues.map((i) => i.path.join(".")).filter(Boolean))];
    return fail(
      campos.length ? `Revisa estos campos: ${campos.join(", ")}` : "Datos inválidos",
      422, { issues: parsed.error.issues },
    );
  }

  const b = parsed.data;

  // Cambiar las cuentas donde se recibe el dinero es sensible: si alguien te
  // roba la sesión, redirigir los pagos es el ataque obvio. Pero eso solo
  // aplica cuando YA hay cuentas puestas: configurarlas por primera vez no
  // tiene nada que robar, y pedir un código por correo ahí solo consigue que
  // el productor no pueda terminar de montar su comunidad si el correo tarda
  // o cae en spam.
  if (b.manualAccounts !== undefined) {
    const yaTenia = (c.manualAccounts ?? []).some((a) => a.number?.trim());
    if (yaTenia) {
      const stepOk = await verifyStepUp(me, b.code);
      if (!stepOk) {
        return fail(
          "Para CAMBIAR tus cuentas de cobro confirma con el código (revisa también el spam) o con tu 2FA.",
          400, { needsCode: true },
        );
      }
    }
  }

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.description !== undefined) patch.description = b.description;
  if (b.iconUrl !== undefined) patch.iconUrl = b.iconUrl;
  if (b.isPublic !== undefined) patch.isPublic = b.isPublic;
  if (b.currency !== undefined) patch.currency = b.currency;
  if (b.affiliateEnabled !== undefined) patch.affiliateEnabled = b.affiliateEnabled;
  if (b.affiliateCommissionPct !== undefined) patch.affiliateCommissionPct = String(b.affiliateCommissionPct);
  if (b.payoutTermsDays !== undefined) patch.payoutTermsDays = b.payoutTermsDays;
  if (b.manualEnabled !== undefined) patch.manualEnabled = b.manualEnabled;
  if (b.manualAccounts !== undefined) patch.manualAccounts = b.manualAccounts;
  if (b.priceCents !== undefined) {
    patch.priceCents = b.priceCents;
    patch.billingPeriod = b.priceCents === 0 ? "free" : (b.billingPeriod ?? (c.billingPeriod === "free" ? "month" : c.billingPeriod));
  } else if (b.billingPeriod !== undefined) {
    patch.billingPeriod = b.billingPeriod;
  }

  if (Object.keys(patch).length === 0) return ok({ updated: false });
  const [updated] = await db.update(communities).set(patch).where(eq(communities.id, c.id)).returning();
  return ok(updated);
}
