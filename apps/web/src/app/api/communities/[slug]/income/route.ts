import { db } from "@/db";
import { paymentOrders, memberships, commissions, payouts, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Panel de ingresos del productor
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);
  const m = await getMembership(c.id, me.id);
  if (!canManage(me.platformRole, m?.role)) return fail("Solo el productor", 403);

  const [rev] = await db
    .select({ total: sql<number>`coalesce(sum(${paymentOrders.amountCents}),0)::int`, count: sql<number>`count(*)::int` })
    .from(paymentOrders)
    .where(and(eq(paymentOrders.communityId, c.id), eq(paymentOrders.status, "paid")));

  const [mem] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.communityId, c.id), eq(memberships.status, "active")));

  const commRows = await db
    .select({ status: commissions.status, total: sql<number>`sum(${commissions.amountCents})::int` })
    .from(commissions)
    .where(eq(commissions.communityId, c.id))
    .groupBy(commissions.status);
  let commissionsOwed = 0, commissionsPaid = 0;
  for (const r of commRows) {
    if (r.status === "paid") commissionsPaid += r.total; else commissionsOwed += r.total;
  }

  const [pend] = await db
    .select({ total: sql<number>`coalesce(sum(${payouts.amountCents}),0)::int` })
    .from(payouts)
    .where(and(eq(payouts.communityId, c.id), eq(payouts.status, "requested")));

  const recent = await db
    .select({
      amountCents: paymentOrders.amountCents, currency: paymentOrders.currency,
      method: paymentOrders.method, paidAt: paymentOrders.paidAt, userEmail: users.email,
    })
    .from(paymentOrders)
    .innerJoin(users, eq(paymentOrders.userId, users.id))
    .where(and(eq(paymentOrders.communityId, c.id), eq(paymentOrders.status, "paid")))
    .orderBy(desc(paymentOrders.paidAt))
    .limit(20);

  return ok({
    currency: c.currency,
    revenueCents: rev.total,
    paidCount: rev.count,
    activeMembers: mem.count,
    commissionsOwedCents: commissionsOwed,
    commissionsPaidCents: commissionsPaid,
    pendingPayoutsCents: pend.total,
    recent,
  });
}
