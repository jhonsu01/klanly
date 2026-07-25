import { z } from "zod";
import { db } from "@/db";
import { users, communities, memberships, subscriptions, commissions } from "@/db/schema";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { currentUser, clearSessionCookie } from "@/lib/auth";
import { verifyStepUp } from "@/lib/stepup";
import { sendEmail, emailTemplate } from "@/lib/mailer";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  confirm: z.string(),                 // debe ser exactamente "confirmo"
  code: z.string().min(6).max(6),      // PIN del correo o 2FA
});

/**
 * GET: informa si la cuenta puede eliminarse ahora.
 * Un PRODUCTOR no puede irse mientras le queden suscriptores con acceso
 * vigente: debe esperar a que termine el mes pagado del último suscriptor,
 * para no dejar a nadie sin el contenido que ya pagó.
 */
async function eligibility(userId: string) {
  const owned = await db
    .select({ id: communities.id, name: communities.name })
    .from(memberships)
    .innerJoin(communities, eq(communities.id, memberships.communityId))
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")));

  if (owned.length === 0) return { canDelete: true as const, communities: [] as string[], lastAccessUntil: null as string | null, activeSubscribers: 0 };

  const ids = owned.map((c) => c.id);
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      last: sql<Date | null>`max(${subscriptions.currentPeriodEnd})`,
    })
    .from(subscriptions)
    .where(and(
      inArray(subscriptions.communityId, ids),
      gt(subscriptions.currentPeriodEnd, new Date()),
    ));

  const activeSubscribers = row?.count ?? 0;
  const last = row?.last ? new Date(row.last) : null;
  // No se cuenta a sí mismo como suscriptor de su propia comunidad
  return {
    canDelete: activeSubscribers === 0,
    communities: owned.map((c) => c.name),
    lastAccessUntil: last ? last.toISOString() : null,
    activeSubscribers,
  };
}

export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  return ok(await eligibility(me.id));
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Faltan datos de confirmación.", 422);
  if (parsed.data.confirm.trim().toLowerCase() !== "confirmo") {
    return fail('Debes escribir exactamente "confirmo" para continuar.', 400);
  }

  const stepOk = await verifyStepUp(me, parsed.data.code);
  if (!stepOk) return fail("Código de confirmación incorrecto o vencido.", 400, { needsCode: true });

  const el = await eligibility(me.id);
  if (!el.canDelete) {
    const hasta = el.lastAccessUntil ? new Date(el.lastAccessUntil).toLocaleDateString("es-CO") : "la fecha de vencimiento";
    return fail(
      `Todavía tienes ${el.activeSubscribers} suscriptor(es) con acceso pagado. Podrás eliminar tu cuenta a partir del ${hasta}, cuando termine el periodo del último suscriptor.`,
      409,
      { blockedUntil: el.lastAccessUntil, activeSubscribers: el.activeSubscribers },
    );
  }

  // Comisiones pendientes de cobro: avisamos pero no bloqueamos (las pierde).
  const [pend] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(commissions)
    .where(and(eq(commissions.affiliateUserId, me.id), eq(commissions.status, "pending")));

  const email = me.email;
  const name = me.displayName;

  // Anonimizamos en vez de borrar filas: preserva la integridad contable
  // (pagos, facturas y auditoría deben seguir existiendo por ley).
  const tag = me.id.slice(0, 8);
  await db.update(users).set({
    email: `eliminado+${tag}@klanly.invalid`,
    displayName: "Cuenta eliminada",
    handle: `eliminado_${tag}`,
    passwordHash: "cuenta-eliminada",
    bio: null,
    avatarUrl: null,
    country: null,
    totpSecret: null,
    emailVerified: false,
    platformRole: "user",
    producerStatus: "none",
    producerAccessUntil: null,
    producerProofUrl: null,
    deletedAt: new Date(),
  }).where(eq(users.id, me.id));

  // Cerrar sus membresías activas
  await db.update(memberships).set({ status: "cancelled" }).where(eq(memberships.userId, me.id));

  await clearSessionCookie();

  await sendEmail(email, "Tu cuenta de Klanly fue eliminada", emailTemplate(
    "Cuenta eliminada",
    `Hola ${name}, confirmamos la eliminación de tu cuenta.<br/><br/>` +
    `Tus datos personales fueron borrados. Por obligaciones contables conservamos los registros de pagos de forma anónima.` +
    (pend?.n ? `<br/><br/>Tenías ${pend.n} comisión(es) pendiente(s) que quedan anuladas.` : "") +
    `<br/><br/>Gracias por haber usado Klanly.`,
  )).catch(() => {});

  return ok({ deleted: true });
}
