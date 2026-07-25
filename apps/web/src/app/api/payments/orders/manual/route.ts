import { z } from "zod";
import { db } from "@/db";
import { communities, memberships, paymentOrders, auditLog } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { newReference, signOrder } from "@/lib/hmac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  communityId: z.string().uuid(),
  proofUrl: z.string().regex(/^(https?:|data:image\/)/, "Comprobante inválido"), // URL o data URL (base64)
  note: z.string().max(300).optional(),
  referralCode: z.string().max(40).optional(), // F4: link de afiliado usado
});

/**
 * Crea una orden de pago MANUAL (comprobante) — reciclado de rifas.
 * El usuario transfiere por fuera (Nequi/Bancolombia/efectivo) y sube UN
 * comprobante. Queda en `awaiting_review` hasta que un admin o el productor
 * la apruebe en /api/payments/orders/[id]/review.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (!me.emailVerified) return fail("Verifica tu correo para continuar.", 403, { needsVerify: true });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422, { issues: parsed.error.issues });

  const [c] = await db.select().from(communities).where(eq(communities.id, parsed.data.communityId)).limit(1);
  if (!c) return fail("Comunidad no encontrada", 404);
  if (c.priceCents <= 0) return fail("Esta comunidad es gratuita", 400);

  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, c.id), eq(memberships.userId, me.id)))
    .limit(1);

  const reference = newReference("man");
  const integrityHash = signOrder(reference, c.priceCents, c.currency);

  const [order] = await db
    .insert(paymentOrders)
    .values({
      communityId: c.id,
      userId: me.id,
      membershipId: membership?.id,
      amountCents: c.priceCents,
      currency: c.currency,
      method: "manual",
      kind: "subscription_initial",
      status: "awaiting_review",
      reference,
      integrityHash,
      manualProofUrl: parsed.data.proofUrl,
      referralCode: parsed.data.referralCode,
    })
    .returning();

  await db.insert(auditLog).values({
    actorId: me.id,
    action: "payment_order.manual_submitted",
    entity: "payment_orders",
    entityId: order.id,
    metadata: { proofUrl: parsed.data.proofUrl, note: parsed.data.note ?? null },
  });

  return ok({ orderId: order.id, status: order.status }, 201);
}
