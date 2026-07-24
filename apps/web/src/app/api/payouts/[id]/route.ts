import { z } from "zod";
import { db } from "@/db";
import { payouts, commissions, communities, memberships, notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ decision: z.enum(["approve", "reject"]) });

/**
 * El productor autoriza (paga) o rechaza una solicitud de payout de afiliado.
 * - approve -> payout `paid`, comisiones vinculadas -> `paid` (transferencia manual por fuera).
 * - reject  -> payout `rejected`, comisiones se desvinculan (vuelven a saldo disponible).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [payout] = await db.select().from(payouts).where(eq(payouts.id, params.id)).limit(1);
  if (!payout) return fail("Payout no encontrado", 404);
  if (payout.status !== "requested") return fail(`El payout está en estado '${payout.status}'`, 409);

  // Autorización: owner/admin de la comunidad del payout, o admin de plataforma
  let authorized = me.platformRole === "admin";
  if (!authorized && payout.communityId) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.communityId, payout.communityId), eq(memberships.userId, me.id)))
      .limit(1);
    authorized = canManage(me.platformRole, m?.role);
  }
  if (!authorized) return fail("No autorizado", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  if (parsed.data.decision === "approve") {
    await db.update(payouts).set({ status: "paid", approvedBy: me.id }).where(eq(payouts.id, payout.id));
    await db.update(commissions).set({ status: "paid" }).where(eq(commissions.payoutId, payout.id));
    await db.insert(notifications).values({
      userId: payout.payeeId,
      communityId: payout.communityId,
      type: "payout_paid",
      body: `Tu payout de ${(payout.amountCents / 100).toFixed(2)} ${payout.currency} fue autorizado y pagado.`,
    });
    return ok({ id: payout.id, status: "paid" });
  }

  // reject: desvincular comisiones (vuelven a disponible)
  await db.update(payouts).set({ status: "rejected", approvedBy: me.id }).where(eq(payouts.id, payout.id));
  await db.update(commissions).set({ payoutId: null }).where(eq(commissions.payoutId, payout.id));
  return ok({ id: payout.id, status: "rejected" });
}
