import { z } from "zod";
import { db } from "@/db";
import { posts, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Feed de la comunidad
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      category: posts.category,
      pinned: posts.pinned,
      likeCount: posts.likeCount,
      createdAt: posts.createdAt,
      authorName: users.displayName,
      authorHandle: users.handle,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.communityId, c.id))
    .orderBy(desc(posts.pinned), desc(posts.createdAt))
    .limit(100);

  return ok(rows);
}

const Body = z.object({
  title: z.string().max(160).optional(),
  body: z.string().min(1).max(5000),
  category: z.string().max(40).optional(),
});

// Publicar en el feed (requiere membresía activa)
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const m = await getMembership(c.id, me.id);
  if (!m || m.status !== "active") return fail("Debes ser miembro activo para publicar", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [p] = await db
    .insert(posts)
    .values({
      communityId: c.id,
      authorId: me.id,
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category,
    })
    .returning();

  return ok(p, 201);
}
