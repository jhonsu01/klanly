import { db } from "@/db";
import { courses, lessons, lessonProgress } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Curso + lecciones + progreso del usuario actual
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [course] = await db.select().from(courses).where(eq(courses.id, params.id)).limit(1);
  if (!course) return fail("Curso no encontrado", 404);

  const rows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, course.id))
    .orderBy(asc(lessons.position));

  const me = await currentUser();
  let completedIds = new Set<string>();
  if (me) {
    const prog = await db
      .select({ lessonId: lessonProgress.lessonId })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, me.id), eq(lessonProgress.completed, true)));
    completedIds = new Set(prog.map((p) => p.lessonId));
  }

  const lessonsOut = rows.map((l) => ({
    id: l.id,
    moduleName: l.moduleName,
    title: l.title,
    videoUrl: l.videoUrl,
    content: l.content,
    minLevel: l.minLevel,
    position: l.position,
    completed: completedIds.has(l.id),
  }));

  const done = lessonsOut.filter((l) => l.completed).length;
  const progressPct = lessonsOut.length ? Math.round((done / lessonsOut.length) * 100) : 0;

  return ok({ course, lessons: lessonsOut, progressPct });
}
