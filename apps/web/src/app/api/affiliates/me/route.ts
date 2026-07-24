import { db } from "@/db";
import { communityAffiliates, communities, commissions, payoutMethods } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  // Mis cuentas de afiliado (link por comunidad)
  const accounts = await db
    .select({
      communityId: communityAffiliates.communityId,
      code: communityAffiliates.code,
      status: communityAffiliates.status,
      slug: communities.slug,
      name: communities.name,
      commissionPct: communities.affiliateCommissionPct,
      payoutTermsDays: communities.payoutTermsDays,
    })
    .from(communityAffiliates)
    .innerJoin(communities, eq(communityAffiliates.communityId, communities.id))
    .where(eq(communityAffiliates.userId, me.id));

  // Comisiones
  const rows = await db.select().from(commissions).where(eq(commissions.affiliateUserId, me.id));
  const now = Date.now();
  let pending = 0, available = 0, requested = 0, paid = 0;
  for (const c of rows) {
    if (c.status === "paid") paid += c.amountCents;
    else if (c.payoutId) requested += c.amountCents;
    else if (new Date(c.availableAt).getTime() <= now) available += c.amountCents;
    else pending += c.amountCents;
  }

  const [pm] = await db.select().from(payoutMethods).where(eq(payoutMethods.userId, me.id)).limit(1);

  return ok({
    accounts: accounts.map((a) => ({ ...a, commissionPct: Number(a.commissionPct) })),
    balance: { pendingCents: pending, availableCents: available, requestedCents: requested, paidCents: paid },
    payoutMethod: pm ? { type: pm.type, details: pm.details } : null,
    recent: rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .map((c) => ({
        amountCents: c.amountCents, currency: c.currency, status: c.status,
        availableAt: c.availableAt, inPayout: !!c.payoutId, createdAt: c.createdAt, communityId: c.communityId,
      })),
  });
}
