import { db } from "@/db";
import { lessons, courses, lessonProgress } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership } from "@/lib/community";
import { awardPoints } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marcar una lección como completada.
 * - Verifica que el nivel del miembro alcance el requerido (bloqueo por nivel).
 * - Idempotente: si ya estaba completada, no vuelve a dar puntos.
 * - Otorga +2 puntos la primera vez.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, params.id)).limit(1);
  if (!lesson) return fail("Lección no encontrada", 404);

  const [course] = await db.select().from(courses).where(eq(courses.id, lesson.courseId)).limit(1);
  if (!course) return fail("Curso no encontrado", 404);

  const m = await getMembership(course.communityId, me.id);
  if (!m || m.status !== "active") return fail("Debes ser miembro activo", 403);

  const requiredLevel = Math.max(lesson.minLevel, course.minLevel);
  if (m.level < requiredLevel) {
    return fail(`Lección bloqueada. Requiere nivel ${requiredLevel} (tienes ${m.level})`, 403);
  }

  const [existing] = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, me.id), eq(lessonProgress.lessonId, lesson.id)))
    .limit(1);

  if (existing?.completed) {
    return ok({ completed: true, alreadyCompleted: true });
  }

  if (existing) {
    await db
      .update(lessonProgress)
      .set({ completed: true, completedAt: new Date() })
      .where(and(eq(lessonProgress.userId, me.id), eq(lessonProgress.lessonId, lesson.id)));
  } else {
    await db.insert(lessonProgress).values({
      userId: me.id,
      lessonId: lesson.id,
      completed: true,
      completedAt: new Date(),
    });
  }

  const g = await awardPoints(course.communityId, me.id, 2);
  return ok({ completed: true, points: g?.points ?? null, level: g?.level ?? null, leveledUp: g?.leveledUp ?? false });
}
