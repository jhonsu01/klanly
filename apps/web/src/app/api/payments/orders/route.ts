import { z } from "zod";
import { db } from "@/db";
import { communities, memberships, paymentOrders, auditLog } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { newReference, signOrder, wompiIntegritySignature } from "@/lib/hmac";
import { wompiCheckoutParams } from "@/lib/wompi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  communityId: z.string().uuid(),
});

/**
 * Crea una orden de pago con PASARELA (Wompi).
 * Reciclado de rifas: reserva la orden, firma la referencia (HMAC) y devuelve
 * los parámetros del checkout. La activación real se hace en el webhook.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [c] = await db.select().from(communities).where(eq(communities.id, parsed.data.communityId)).limit(1);
  if (!c) return fail("Comunidad no encontrada", 404);
  if (c.priceCents <= 0) return fail("Esta comunidad es gratuita", 400);

  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, c.id), eq(memberships.userId, me.id)))
    .limit(1);

  const reference = newReference();
  const integrityHash = signOrder(reference, c.priceCents, c.currency);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min de reserva

  const [order] = await db
    .insert(paymentOrders)
    .values({
      communityId: c.id,
      userId: me.id,
      membershipId: membership?.id,
      amountCents: c.priceCents,
      currency: c.currency,
      method: "wompi",
      kind: "subscription_initial",
      status: "pending",
      reference,
      integrityHash,
      expiresAt,
    })
    .returning();

  await db.insert(auditLog).values({
    actorId: me.id,
    action: "payment_order.created",
    entity: "payment_orders",
    entityId: order.id,
    metadata: { method: "wompi", amountCents: c.priceCents },
  });

  const appUrl = process.env.APP_URL ?? "";
  const wompiSignature = wompiIntegritySignature(reference, c.priceCents, c.currency);
  const checkout = wompiCheckoutParams({
    reference,
    amountInCents: c.priceCents,
    currency: c.currency,
    integritySignature: wompiSignature,
    redirectUrl: `${appUrl}/pago/retorno?ref=${reference}`,
    customerEmail: me.email,
  });

  return ok({ orderId: order.id, reference, checkout }, 201);
}
