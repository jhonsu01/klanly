import { db } from "@/db";
import {
  paymentOrders, memberships, subscriptions, communities, auditLog,
  communityAffiliates, commissions,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notify } from "./notify";

const APP_URL = process.env.APP_URL || "https://klanly.vercel.app";

/**
 * Marca una orden como pagada y ACTIVA (o RENUEVA) el acceso a la comunidad.
 * - La membresía queda activa y la suscripción extiende su período (net por mes/año).
 * - En renovación, extiende desde el fin de período actual si aún es futuro.
 * Idempotente: si la orden ya está `paid`, no hace nada.
 */
export async function activateOrderPaid(orderId: string, actorId?: string) {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).limit(1);
  if (!order) return { ok: false as const, reason: "order_not_found" };
  if (order.status === "paid") return { ok: true as const, alreadyPaid: true };

  await db
    .update(paymentOrders)
    .set({ status: "paid", paidAt: new Date(), reviewedBy: actorId ?? null })
    .where(eq(paymentOrders.id, order.id));

  const [c] = await db.select().from(communities).where(eq(communities.id, order.communityId)).limit(1);

  // Activar / crear membresía
  const [existing] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, order.communityId), eq(memberships.userId, order.userId)))
    .limit(1);

  if (existing) {
    await db.update(memberships).set({ status: "active" }).where(eq(memberships.id, existing.id));
  } else {
    await db.insert(memberships).values({ communityId: order.communityId, userId: order.userId, role: "member", status: "active" });
  }

  // Suscripción: extiende el período (renovación) o la crea
  let periodEnd: Date | null = null;
  if (c && c.billingPeriod !== "one_time" && c.billingPeriod !== "free") {
    const days = c.billingPeriod === "year" ? 365 : 30;
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.communityId, order.communityId), eq(subscriptions.userId, order.userId)))
      .limit(1);
    const base = sub && new Date(sub.currentPeriodEnd).getTime() > Date.now() ? new Date(sub.currentPeriodEnd) : new Date();
    periodEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    const provider = order.method === "manual" ? "manual" : "wompi";
    if (sub) {
      await db.update(subscriptions).set({ currentPeriodEnd: periodEnd, status: "active", provider }).where(eq(subscriptions.id, sub.id));
    } else {
      await db.insert(subscriptions).values({ communityId: order.communityId, userId: order.userId, provider, currentPeriodEnd: periodEnd, status: "active" });
    }
  }

  await db.insert(auditLog).values({
    actorId: actorId ?? null,
    action: "payment_order.paid",
    entity: "payment_orders",
    entityId: order.id,
    metadata: { method: order.method, amountCents: order.amountCents },
  });

  const until = periodEnd ? ` Acceso hasta ${periodEnd.toLocaleDateString()}.` : "";
  await notify(order.userId, {
    type: "payment_approved",
    communityId: order.communityId,
    body: c ? `Tu pago fue aprobado. Ya tienes acceso a ${c.name}.${until}` : "Tu pago fue aprobado.",
    emailSubject: "Pago aprobado en Klanly",
    cta: c ? { label: `Ir a ${c.name}`, url: `${APP_URL}/c/${c.slug}` } : undefined,
  });

  // ---- F4: comisión de afiliado ----
  if (order.referralCode && c && c.affiliateEnabled) {
    const [aff] = await db
      .select()
      .from(communityAffiliates)
      .where(and(
        eq(communityAffiliates.communityId, order.communityId),
        eq(communityAffiliates.code, order.referralCode),
        eq(communityAffiliates.status, "approved"),
      ))
      .limit(1);

    if (aff && aff.userId !== order.userId) {
      const pct = Number(c.affiliateCommissionPct ?? 0);
      const commissionCents = Math.round((order.amountCents * pct) / 100);
      if (commissionCents > 0) {
        const availableAt = new Date(Date.now() + (c.payoutTermsDays ?? 30) * 24 * 60 * 60 * 1000);
        await db.insert(commissions).values({
          affiliateUserId: aff.userId, communityId: order.communityId, orderId: order.id,
          referredUserId: order.userId, amountCents: commissionCents, currency: order.currency,
          status: "pending", availableAt,
        });
        await notify(aff.userId, {
          type: "commission_earned",
          communityId: order.communityId,
          body: `Ganaste una comisión de ${(commissionCents / 100).toFixed(2)} ${order.currency} (disponible en ${c.payoutTermsDays} días).`,
          emailSubject: "Ganaste una comisión en Klanly",
          cta: { label: "Ver mi panel de afiliado", url: `${APP_URL}/afiliados` },
        });
      }
    }
  }

  return { ok: true as const };
}
