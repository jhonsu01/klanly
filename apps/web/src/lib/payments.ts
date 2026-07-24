import { db } from "@/db";
import { paymentOrders, memberships, subscriptions, communities, auditLog } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Marca una orden como pagada y ACTIVA el acceso a la comunidad.
 * Reciclado de rifas: donde antes se "vendían los números", aquí se activa
 * (o renueva) la membresía y se crea/actualiza la suscripción.
 *
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

  // Activar / crear membresía
  const [existing] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, order.communityId), eq(memberships.userId, order.userId)))
    .limit(1);

  if (existing) {
    await db.update(memberships).set({ status: "active" }).where(eq(memberships.id, existing.id));
  } else {
    await db.insert(memberships).values({
      communityId: order.communityId,
      userId: order.userId,
      role: "member",
      status: "active",
    });
  }

  // Suscripción recurrente (período mensual por defecto)
  const [c] = await db.select().from(communities).where(eq(communities.id, order.communityId)).limit(1);
  const days = c?.billingPeriod === "year" ? 365 : 30;
  const periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  if (c && c.billingPeriod !== "one_time" && c.billingPeriod !== "free") {
    await db.insert(subscriptions).values({
      communityId: order.communityId,
      userId: order.userId,
      provider: order.method === "manual" ? "manual" : "wompi",
      currentPeriodEnd: periodEnd,
      status: "active",
    });
  }

  await db.insert(auditLog).values({
    actorId: actorId ?? null,
    action: "payment_order.paid",
    entity: "payment_orders",
    entityId: order.id,
    metadata: { method: order.method, amountCents: order.amountCents },
  });

  return { ok: true as const };
}
