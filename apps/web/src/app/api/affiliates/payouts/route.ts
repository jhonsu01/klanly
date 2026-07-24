import { z } from "zod";
import { db } from "@/db";
import { commissions, payouts, payoutMethods, communities, notifications, memberships } from "@/db/schema";
import { and, eq, isNull, lte } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ communityId: z.string().uuid() });

/**
 * El afiliado solicita el pago de su saldo DISPONIBLE (comisiones cuya fecha
 * net30/60 ya pasó) en una comunidad. Crea un payout `requested` que el
 * productor debe autorizar.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [pm] = await db.select().from(payoutMethods).where(eq(payoutMethods.userId, me.id)).limit(1);
  if (!pm) return fail("Configura primero tu medio de pago", 400);

  // Comisiones disponibles (pending, sin payout, availableAt <= ahora)
  const available = await db
    .select()
    .from(commissions)
    .where(
      and(
        eq(commissions.affiliateUserId, me.id),
        eq(commissions.communityId, parsed.data.communityId),
        eq(commissions.status, "pending"),
        isNull(commissions.payoutId),
        lte(commissions.availableAt, new Date()),
      ),
    );

  if (available.length === 0) return fail("No tienes saldo disponible para retirar", 400);

  const total = available.reduce((s, c) => s + c.amountCents, 0);
  const currency = available[0].currency;

  const [payout] = await db
    .insert(payouts)
    .values({
      payeeId: me.id,
      communityId: parsed.data.communityId,
      amountCents: total,
      currency,
      kind: "affiliate",
      method: `${pm.type}: ${pm.details}`,
      status: "requested",
    })
    .returning();

  // Vincular las comisiones a este payout
  for (const c of available) {
    await db.update(commissions).set({ payoutId: payout.id }).where(eq(commissions.id, c.id));
  }

  // Notificar a los owners/admin de la comunidad
  const [com] = await db.select().from(communities).where(eq(communities.id, parsed.data.communityId)).limit(1);
  const managers = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.communityId, parsed.data.communityId), eq(memberships.role, "owner")));
  for (const mgr of managers) {
    await db.insert(notifications).values({
      userId: mgr.userId,
      communityId: parsed.data.communityId,
      type: "payout_requested",
      body: `Un afiliado solicitó un payout de ${(total / 100).toFixed(2)} ${currency}${com ? ` en ${com.name}` : ""}.`,
    });
  }

  return ok({ payoutId: payout.id, amountCents: total, currency }, 201);
}
