import { db } from "@/db";
import { communities, memberships } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Unirse a una comunidad (por slug o por id).
 * - Free  -> membresía activa inmediata.
 * - Pago  -> membresía "pending"; el frontend inicia el cobro
 *            (POST /api/payments/orders para pasarela, o /manual para comprobante).
 */
export async function POST(_req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (!me.emailVerified) return fail("Verifica tu correo para continuar.", 403, { needsVerify: true });

  const key = params.slug;
  const [c] = await db
    .select()
    .from(communities)
    .where(UUID.test(key) ? or(eq(communities.id, key), eq(communities.slug, key)) : eq(communities.slug, key))
    .limit(1);
  if (!c) return fail("Comunidad no encontrada", 404);

  const [already] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, c.id), eq(memberships.userId, me.id)))
    .limit(1);
  if (already) return ok({ membership: already, requiresPayment: false, alreadyMember: true });

  const isFree = c.priceCents === 0 || c.billingPeriod === "free";

  const [m] = await db
    .insert(memberships)
    .values({
      communityId: c.id,
      userId: me.id,
      role: "member",
      status: isFree ? "active" : "pending",
    })
    .returning();

  return ok({
    membership: m,
    requiresPayment: !isFree,
    communityId: c.id,
    amountCents: c.priceCents,
    currency: c.currency,
  });
}
