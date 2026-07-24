import { db } from "@/db";
import { paymentOrders, processedEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyWompiEvent, getWompiTransaction } from "@/lib/wompi";
import { activateOrderPaid } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de Wompi — reciclado de rifas.
 * 1) Verifica la firma del evento (nunca confiar en el redirect del cliente).
 * 2) Idempotencia con processed_events.
 * 3) Si la transacción está APPROVED, activa la membresía de la orden.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return new Response("bad request", { status: 400 });

  if (!verifyWompiEvent(body)) {
    return new Response("invalid signature", { status: 401 });
  }

  const tx = body?.data?.transaction;
  const eventId: string | undefined = body?.data?.transaction?.id
    ? `wompi_${body.event}_${body.data.transaction.id}_${body.sent_at ?? ""}`
    : undefined;

  if (!tx || !eventId) return new Response("no transaction", { status: 200 });

  // Idempotencia: si ya lo procesamos, salir OK
  const [seen] = await db.select().from(processedEvents).where(eq(processedEvents.eventId, eventId)).limit(1);
  if (seen) return new Response("already processed", { status: 200 });
  await db.insert(processedEvents).values({ eventId, provider: "wompi" }).onConflictDoNothing();

  // Buscar la orden por referencia
  const reference: string | undefined = tx.reference;
  if (!reference) return new Response("no reference", { status: 200 });

  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.reference, reference)).limit(1);
  if (!order) return new Response("order not found", { status: 200 });

  // Fuente de verdad: consultar el estado real en Wompi (defensa extra)
  let status = tx.status as string;
  const fresh = await getWompiTransaction(tx.id).catch(() => null);
  if (fresh?.status) status = fresh.status;

  if (status === "APPROVED") {
    await activateOrderPaid(order.id);
  } else if (status === "DECLINED" || status === "ERROR" || status === "VOIDED") {
    await db.update(paymentOrders).set({ status: "failed" }).where(eq(paymentOrders.id, order.id));
  }

  return new Response("ok", { status: 200 });
}
