import { z } from "zod";
import { db } from "@/db";
import { courses, communities, lessons, lessonProgress } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertManager(courseId: string) {
  const me = await currentUser();
  if (!me) return { err: fail("No autenticado", 401) };
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return { err: fail("Curso no encontrado", 404) };
  const m = await getMembership(course.communityId, me.id);
  if (!canManage(me.platformRole, m?.role)) return { err: fail("Solo el productor puede editar", 403) };
  return { me, course };
}

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
    resources: l.resources ?? [],
    minLevel: l.minLevel,
    position: l.position,
    completed: completedIds.has(l.id),
    locked: myLevel < Math.max(l.minLevel, course.minLevel),
  }));

  const done = lessonsOut.filter((l) => l.completed).length;
  const progressPct = lessonsOut.length ? Math.round((done / lessonsOut.length) * 100) : 0;

  return ok({
    course: { id: course.id, title: course.title, description: course.description, coverUrl: course.coverUrl, minLevel: course.minLevel },
    community: com ? { slug: com.slug, name: com.name } : null,
    lessons: lessonsOut,
    progressPct,
    isManager,
    isMember,
    myLevel,
  });
}

const PatchBody = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional(),
  coverUrl: z.string().url().optional(),
  minLevel: z.number().int().min(1).max(9).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await assertManager(params.id);
  if (a.err) return a.err;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const patch: Record<string, unknown> = {};
  for (const k of ["title", "description", "coverUrl", "minLevel"] as const) {
    if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
  }
  if (Object.keys(patch).length === 0) return ok({ updated: false });
  const [updated] = await db.update(courses).set(patch).where(eq(courses.id, params.id)).returning();
  return ok(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const a = await assertManager(params.id);
  if (a.err) return a.err;

  const ls = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, params.id));
  const ids = ls.map((l) => l.id);
  if (ids.length) {
    await db.delete(lessonProgress).where(inArray(lessonProgress.lessonId, ids));
    await db.delete(lessons).where(eq(lessons.courseId, params.id));
  }
  await db.delete(courses).where(eq(courses.id, params.id));
  return ok({ deleted: true });
}
