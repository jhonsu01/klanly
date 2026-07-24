import { z } from "zod";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const rows = await db
    .select()
    .from(courses)
    .where(eq(courses.communityId, c.id))
    .orderBy(asc(courses.position), asc(courses.createdAt))
    .limit(100);
  return ok(rows);
}

const Body = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  coverUrl: z.string().url().optional(),
  minLevel: z.number().int().min(1).max(9).default(1),
});

// Crear curso (owner/admin de la comunidad o admin de plataforma)
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const m = await getMembership(c.id, me.id);
  if (!canManage(me.platformRole, m?.role)) return fail("Solo el productor puede crear cursos", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [course] = await db
    .insert(courses)
    .values({
      communityId: c.id,
      title: parsed.data.title,
      description: parsed.data.description,
      coverUrl: parsed.data.coverUrl,
      minLevel: parsed.data.minLevel,
    })
    .returning();

  return ok(course, 201);
}
