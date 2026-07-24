import { db } from "@/db";
import { payouts, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Productor: solicitudes de payout de afiliados en su comunidad
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);
  const m = await getMembership(c.id, me.id);
  if (!canManage(me.platformRole, m?.role)) return fail("Solo el productor", 403);

  const rows = await db
    .select({
      id: payouts.id,
      amountCents: payouts.amountCents,
      currency: payouts.currency,
      method: payouts.method,
      status: payouts.status,
      createdAt: payouts.createdAt,
      payeeName: users.displayName,
      payeeHandle: users.handle,
    })
    .from(payouts)
    .innerJoin(users, eq(payouts.payeeId, users.id))
    .where(and(eq(payouts.communityId, c.id), eq(payouts.kind, "affiliate")))
    .orderBy(desc(payouts.createdAt))
    .limit(200);

  return ok(rows);
}
