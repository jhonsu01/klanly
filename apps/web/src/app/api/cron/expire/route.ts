import { db } from "@/db";
import { memberships, subscriptions, communities, users } from "@/db/schema";
import { and, eq, lt, gte } from "drizzle-orm";
import { ok } from "@/lib/http";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL || "https://klanly.vercel.app";

/**
 * Job diario (Vercel Cron): expira accesos vencidos y notifica.
 * - Membresías de pago cuyo período venció → `past_due` (pierden acceso hasta renovar).
 * - Productores cuyo plan venció → notificación (el gate ya bloquea publicar).
 * Protegido con CRON_SECRET (Vercel Cron envía Authorization: Bearer <CRON_SECRET>).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  }

  const now = new Date();
  let expiredMemberships = 0;
  let expiredProducers = 0;

  // 1) Membresías activas cuyo período de suscripción venció
  const rows = await db
    .select({
      mId: memberships.id, userId: memberships.userId, communityId: memberships.communityId,
      end: subscriptions.currentPeriodEnd, name: communities.name, slug: communities.slug,
    })
    .from(memberships)
    .innerJoin(subscriptions, and(eq(subscriptions.communityId, memberships.communityId), eq(subscriptions.userId, memberships.userId)))
    .innerJoin(communities, eq(memberships.communityId, communities.id))
    .where(and(eq(memberships.status, "active"), lt(subscriptions.currentPeriodEnd, now)));

  for (const r of rows) {
    await db.update(memberships).set({ status: "past_due" }).where(eq(memberships.id, r.mId));
    await db.update(subscriptions).set({ status: "past_due" }).where(and(eq(subscriptions.communityId, r.communityId), eq(subscriptions.userId, r.userId)));
    await notify(r.userId, {
      type: "membership_expired",
      communityId: r.communityId,
      body: `Tu acceso a ${r.name} venció. Renueva tu pago para recuperarlo.`,
      emailSubject: `Tu acceso a ${r.name} venció`,
      cta: { label: "Renovar", url: `${APP_URL}/c/${r.slug}` },
    });
    expiredMemberships++;
  }

  // 2) Productores cuyo plan venció en las últimas ~25h (notificar una vez)
  const windowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000);
  const prods = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(and(eq(users.producerStatus, "approved"), lt(users.producerAccessUntil, now), gte(users.producerAccessUntil, windowStart)));
  for (const p of prods) {
    await notify(p.id, {
      type: "producer_expired",
      body: "Tu acceso de productor venció. Renueva tu plan para seguir publicando comunidades.",
      emailSubject: "Tu acceso de productor venció",
      cta: { label: "Renovar plan", url: APP_URL },
    });
    expiredProducers++;
  }

  return ok({ expiredMemberships, expiredProducers, at: now.toISOString() });
}
