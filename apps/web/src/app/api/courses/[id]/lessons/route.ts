import { z } from "zod";
import { db } from "@/db";
import { courses, lessons } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(2).max(160),
  moduleName: z.string().max(80).optional(),
  videoUrl: z.string().url().optional(),
  content: z.string().max(10000).optional(),
  minLevel: z.number().int().min(1).max(9).default(1),
});

// Agregar lección a un curso (owner/admin)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [course] = await db.select().from(courses).where(eq(courses.id, params.id)).limit(1);
  if (!course) return fail("Curso no encontrado", 404);

  const m = await getMembership(course.communityId, me.id);
  if (!canManage(me.platformRole, m?.role)) return fail("Solo el productor puede editar el curso", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${lessons.position}), 0) + 1` })
    .from(lessons)
    .where(eq(lessons.courseId, course.id));

  const [l] = await db
    .insert(lessons)
    .values({
      courseId: course.id,
      title: parsed.data.title,
      moduleName: parsed.data.moduleName,
      videoUrl: parsed.data.videoUrl,
      content: parsed.data.content,
      minLevel: parsed.data.minLevel,
      position: next,
    })
    .returning();

  return ok(l, 201);
}
