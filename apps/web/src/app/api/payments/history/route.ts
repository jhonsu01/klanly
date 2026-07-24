import { db } from "@/db";
import { paymentOrders, communities } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Historial de pagos del usuario actual
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const rows = await db
    .select({
      id: paymentOrders.id,
      amountCents: paymentOrders.amountCents,
      currency: paymentOrders.currency,
      method: paymentOrders.method,
      status: paymentOrders.status,
      createdAt: paymentOrders.createdAt,
      paidAt: paymentOrders.paidAt,
      communityName: communities.name,
      communitySlug: communities.slug,
    })
    .from(paymentOrders)
    .innerJoin(communities, eq(paymentOrders.communityId, communities.id))
    .where(eq(paymentOrders.userId, me.id))
    .orderBy(desc(paymentOrders.createdAt))
    .limit(100);

  return ok(rows);
}
