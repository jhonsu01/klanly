import { db } from "@/db";
import { courses, communities, lessons, lessonProgress } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Curso + comunidad + lecciones (en secuencia) + progreso del usuario actual
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [course] = await db.select().from(courses).where(eq(courses.id, params.id)).limit(1);
  if (!course) return fail("Curso no encontrado", 404);

  const [com] = await db.select().from(communities).where(eq(communities.id, course.communityId)).limit(1);

  const rows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, course.id))
    .orderBy(asc(lessons.position));

  const me = await currentUser();
  let completedIds = new Set<string>();
  let myLevel = 0;
  let isManager = false;
  let isMember = false;
  if (me) {
    const prog = await db
      .select({ lessonId: lessonProgress.lessonId })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, me.id), eq(lessonProgress.completed, true)));
    completedIds = new Set(prog.map((p) => p.lessonId));

    const m = await getMembership(course.communityId, me.id);
    myLevel = m?.level ?? 0;
    isMember = !!m && m.status === "active";
    isManager = canManage(me.platformRole, m?.role);
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
    locked: myLevel < Math.max(l.minLevel, course.minLevel),
  }));

  const done = lessonsOut.filter((l) => l.completed).length;
  const progressPct = lessonsOut.length ? Math.round((done / lessonsOut.length) * 100) : 0;

  return ok({
    course: { id: course.id, title: course.title, description: course.description, minLevel: course.minLevel },
    community: com ? { slug: com.slug, name: com.name } : null,
    lessons: lessonsOut,
    progressPct,
    isManager,
    isMember,
    myLevel,
  });
}
