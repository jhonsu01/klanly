import { db } from "@/db";
import { paymentOrders, communities, users, memberships } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cola de comprobantes manuales por revisar.
 * - ADMIN de plataforma: ve todos.
 * - PRODUCTOR: ve solo los de las comunidades donde es owner/admin.
 */
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const base = db
    .select({
      id: paymentOrders.id,
      reference: paymentOrders.reference,
      amountCents: paymentOrders.amountCents,
      currency: paymentOrders.currency,
      proofUrl: paymentOrders.manualProofUrl,
      createdAt: paymentOrders.createdAt,
      communityId: paymentOrders.communityId,
      communityName: communities.name,
      userEmail: users.email,
    })
    .from(paymentOrders)
    .innerJoin(communities, eq(paymentOrders.communityId, communities.id))
    .innerJoin(users, eq(paymentOrders.userId, users.id));

  if (me.platformRole === "admin") {
    const rows = await base.where(eq(paymentOrders.status, "awaiting_review")).limit(200);
    return ok(rows);
  }

  // Productor: comunidades donde es owner/admin
  const myComs = await db
    .select({ id: memberships.communityId })
    .from(memberships)
    .where(and(eq(memberships.userId, me.id), inArray(memberships.role, ["owner", "admin"])));
  const ids = myComs.map((r) => r.id);
  if (ids.length === 0) return ok([]);

  const rows = await base
    .where(and(eq(paymentOrders.status, "awaiting_review"), inArray(paymentOrders.communityId, ids)))
    .limit(200);
  return ok(rows);
}
