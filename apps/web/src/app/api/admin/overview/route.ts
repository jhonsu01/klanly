import { db } from "@/db";
import { communities, users, paymentOrders, payouts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Métricas globales para el super admin (panel de escritorio /admin)
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.platformRole !== "admin") return fail("Solo el super admin", 403);

  const [coms] = await db.select({ n: sql<number>`count(*)::int` }).from(communities);
  const [us] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  const [pendProducers] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.producerStatus, "pending"));
  const [pendProofs] = await db.select({ n: sql<number>`count(*)::int` }).from(paymentOrders).where(eq(paymentOrders.status, "awaiting_review"));
  const [pendPayouts] = await db.select({ n: sql<number>`count(*)::int` }).from(payouts).where(eq(payouts.status, "requested"));
  const [rev] = await db.select({ total: sql<number>`coalesce(sum(${paymentOrders.amountCents}),0)::int` }).from(paymentOrders).where(eq(paymentOrders.status, "paid"));

  return ok({
    communities: coms.n,
    users: us.n,
    pendingProducers: pendProducers.n,
    pendingProofs: pendProofs.n,
    pendingPayouts: pendPayouts.n,
    grossRevenueCents: rev.total,
  });
}
