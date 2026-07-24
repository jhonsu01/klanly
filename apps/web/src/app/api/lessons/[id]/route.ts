import { z } from "zod";
import { db } from "@/db";
import { lessons, courses, lessonProgress } from "@/db/schema";
import { and, asc, eq, gt, lt, desc } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function managerFor(lessonId: string) {
  const me = await currentUser();
  if (!me) return { err: fail("No autenticado", 401) };
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) return { err: fail("Lección no encontrada", 404) };
  const [course] = await db.select().from(courses).where(eq(courses.id, lesson.courseId)).limit(1);
  if (!course) return { err: fail("Curso no encontrado", 404) };
  const m = await getMembership(course.communityId, me.id);
  if (!canManage(me.platformRole, m?.role)) return { err: fail("Solo el productor puede editar", 403) };
  return { lesson, course };
}

const Body = z.object({
  title: z.string().min(2).max(160).optional(),
  moduleName: z.string().max(80).optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  content: z.string().max(10000).optional(),
  minLevel: z.number().int().min(1).max(9).optional(),
  move: z.enum(["up", "down"]).optional(), // reordenar
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await managerFor(params.id);
  if (a.err) return a.err;
  const lesson = a.lesson!;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  // Reordenar: intercambia posición con el vecino
  if (parsed.data.move) {
    const neighbor = parsed.data.move === "up"
      ? (await db.select().from(lessons).where(and(eq(lessons.courseId, lesson.courseId), lt(lessons.position, lesson.position))).orderBy(desc(lessons.position)).limit(1))[0]
      : (await db.select().from(lessons).where(and(eq(lessons.courseId, lesson.courseId), gt(lessons.position, lesson.position))).orderBy(asc(lessons.position)).limit(1))[0];
    if (!neighbor) return ok({ moved: false });
    await db.update(lessons).set({ position: neighbor.position }).where(eq(lessons.id, lesson.id));
    await db.update(lessons).set({ position: lesson.position }).where(eq(lessons.id, neighbor.id));
    return ok({ moved: true });
  }

  const patch: Record<string, unknown> = {};
  for (const k of ["title", "moduleName", "content", "minLevel"] as const) {
    if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
  }
  if (parsed.data.videoUrl !== undefined) patch.videoUrl = parsed.data.videoUrl || null;
  if (Object.keys(patch).length === 0) return ok({ updated: false });

  const [updated] = await db.update(lessons).set(patch).where(eq(lessons.id, params.id)).returning();
  return ok(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const a = await managerFor(params.id);
  if (a.err) return a.err;

  await db.delete(lessonProgress).where(eq(lessonProgress.lessonId, params.id));
  await db.delete(lessons).where(eq(lessons.id, params.id));
  return ok({ deleted: true });
}
