import { db } from "@/db";
import { payouts, users, communities } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Super admin: todas las solicitudes de payout de afiliados (global)
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.platformRole !== "admin") return fail("Solo el super admin", 403);

  const rows = await db
    .select({
      id: payouts.id,
      amountCents: payouts.amountCents,
      currency: payouts.currency,
      method: payouts.method,
      status: payouts.status,
      createdAt: payouts.createdAt,
      payeeName: users.displayName,
      payeeEmail: users.email,
      communityName: communities.name,
    })
    .from(payouts)
    .innerJoin(users, eq(payouts.payeeId, users.id))
    .leftJoin(communities, eq(payouts.communityId, communities.id))
    .orderBy(desc(payouts.createdAt))
    .limit(200);

  return ok(rows);
}
