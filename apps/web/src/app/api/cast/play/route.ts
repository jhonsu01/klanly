import { z } from "zod";
import { db } from "@/db";
import { castDevices, lessons, courses } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { getMembership, canManage } from "@/lib/community";
import { rateLimit } from "@/lib/ratelimit";
import { pushToChannel } from "@/lib/pusher";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HORAS_EMPAREJADO = 12;

const Body = z.object({
  /** Primer envío: el usuario escribe el PIN que muestra la TV. */
  pin: z.string().regex(/^\d{6}$/, "El PIN son 6 dígitos").optional(),
  /**
   * Envíos siguientes: la pantalla ya emparejada. Se usa esto en vez del PIN
   * porque el PIN caduca a los 10 minutos y el emparejamiento dura horas.
   */
  deviceId: z.string().uuid().optional(),
  lessonId: z.string().uuid(),
  reps: z.number().int().min(1).max(5000).optional(),
}).refine((b) => !!b.pin || !!b.deviceId, {
  message: "Hace falta el PIN de la TV",
});

/**
 * El CELULAR envía una lección a la pantalla emparejada.
 *
 * Toda la autorización ocurre aquí, del lado del celular, que sí tiene sesión:
 * se comprueba que quien envía es miembro activo (o gestor) de la comunidad
 * dueña del curso. La TV nunca pide contenido por su cuenta — solo recibe lo
 * que este endpoint publica en su canal. Así una pantalla sin cuenta jamás
 * puede saltarse el muro de pago.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const rl = rateLimit(`cast-play:${me.id}`, 30, 60_000);
  if (!rl.ok) return fail("Demasiados envíos seguidos.", 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422, { issues: parsed.error.issues });

  // ── 1) Localizar la pantalla ───────────────────────────────────────────────
  const ahora = new Date();
  let dev;

  if (parsed.data.deviceId) {
    // Pantalla ya emparejada con ESTE usuario: no se necesita PIN.
    [dev] = await db
      .select()
      .from(castDevices)
      .where(and(
        eq(castDevices.id, parsed.data.deviceId),
        eq(castDevices.userId, me.id),
        gt(castDevices.pairedUntil, ahora),
      ))
      .limit(1);
    if (!dev) {
      return fail("La pantalla ya no está emparejada. Escribe otra vez el PIN que muestra la TV.", 410, { needsPin: true });
    }
  } else {
    [dev] = await db
      .select()
      .from(castDevices)
      .where(and(eq(castDevices.pin, parsed.data.pin!), gt(castDevices.pinExpiresAt, ahora)))
      .limit(1);
    if (!dev) return fail("PIN no válido o vencido. Mira el PIN que muestra la TV ahora.", 404, { needsPin: true });

    // Una pantalla ya emparejada con OTRO usuario no se secuestra
    if (dev.userId && dev.userId !== me.id && dev.pairedUntil && dev.pairedUntil > ahora) {
      return fail("Esa pantalla está emparejada con otra cuenta.", 409);
    }
  }

  // ── 2) ¿Puede este usuario ver esa lección? ────────────────────────────────
  const [row] = await db
    .select({ lesson: lessons, course: courses })
    .from(lessons)
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .where(eq(lessons.id, parsed.data.lessonId))
    .limit(1);
  if (!row) return fail("Lección no encontrada", 404);

  const m = await getMembership(row.course.communityId, me.id);
  const esGestor = canManage(me.platformRole, m?.role);
  const esMiembro = !!m && m.status === "active";
  if (!esMiembro && !esGestor) {
    return fail("Debes ser miembro activo para enviar esta lección a la TV.", 403);
  }
  const nivel = m?.level ?? 0;
  if (nivel < Math.max(row.lesson.minLevel, row.course.minLevel)) {
    return fail(`Esta lección se desbloquea en el nivel ${row.lesson.minLevel}.`, 403);
  }
  if (!row.lesson.videoUrl) return fail("Esta lección no tiene video.", 400);

  // ── 3) Emparejar (o renovar) y enviar ─────────────────────────────────────
  await db
    .update(castDevices)
    .set({
      userId: me.id,
      pairedUntil: new Date(Date.now() + HORAS_EMPAREJADO * 3600_000),
      lastSeenAt: ahora,
    })
    .where(eq(castDevices.id, dev.id));

  const wk = row.lesson.workout;
  const enviado = await pushToChannel(`cast-${dev.id}`, "play", {
    lessonId: row.lesson.id,
    title: row.lesson.title,
    courseTitle: row.course.title,
    videoUrl: row.lesson.videoUrl,
    kind: row.lesson.kind,
    workout: wk ?? null,
    reps: parsed.data.reps ?? wk?.defaultReps ?? null,
    sentBy: me.displayName,
  });

  if (!enviado) {
    return fail("El canal en tiempo real no está configurado en el servidor.", 503);
  }
  // Se devuelve el deviceId: el celular lo guarda y a partir de aquí envía con
  // él, así el PIN puede caducar sin romper nada.
  return ok({ sent: true, deviceId: dev.id, label: dev.label });
}
