import { z } from "zod";
import { db } from "@/db";
import { paymentOrders, memberships, auditLog } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { activateOrderPaid } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(300).optional(),
});

/**
 * Revisión de un cobro MANUAL — reciclado de rifas.
 * Puede aprobar/rechazar: el ADMIN de plataforma, o el PRODUCTOR (owner/admin)
 * de la comunidad de esa orden.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, params.id)).limit(1);
  if (!order) return fail("Orden no encontrada", 404);
  if (order.status !== "awaiting_review") return fail(`La orden está en estado '${order.status}'`, 409);

  // Autorización: admin de plataforma, o rol owner/admin en la comunidad
  let authorized = me.platformRole === "admin";
  if (!authorized) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.communityId, order.communityId), eq(memberships.userId, me.id)))
      .limit(1);
    authorized = !!m && (m.role === "owner" || m.role === "admin");
  }
  if (!authorized) return fail("No autorizado para revisar esta orden", 403);

  if (parsed.data.decision === "reject") {
    await db.update(paymentOrders).set({ status: "failed", reviewedBy: me.id }).where(eq(paymentOrders.id, order.id));
    await db.insert(auditLog).values({
      actorId: me.id,
      action: "payment_order.rejected",
      entity: "payment_orders",
      entityId: order.id,
      metadata: { reason: parsed.data.reason ?? null },
    });
    return ok({ orderId: order.id, status: "failed" });
  }

  const result = await activateOrderPaid(order.id, me.id);
  if (!result.ok) return fail("No se pudo activar la orden", 500);
  return ok({ orderId: order.id, status: "paid" });
}
