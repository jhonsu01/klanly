import { z } from "zod";
import { db } from "@/db";
import { posts, comments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().max(160).optional(),
  body: z.string().min(1).max(5000).optional(),
  category: z.string().max(40).optional(),
  pinned: z.boolean().optional(),
});

/** Editar/fijar un post. Autor puede editar contenido; owner/admin puede fijar y editar cualquiera. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [post] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1);
  if (!post) return fail("Publicación no encontrada", 404);

  const m = await getMembership(post.communityId, me.id);
  const manager = canManage(me.platformRole, m?.role);
  const isAuthor = post.authorId === me.id;
  if (!manager && !isAuthor) return fail("No autorizado", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.body !== undefined) patch.body = parsed.data.body;
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.pinned !== undefined) {
    if (!manager) return fail("Solo el productor puede fijar", 403);
    patch.pinned = parsed.data.pinned;
  }
  if (Object.keys(patch).length === 0) return ok({ updated: false });

  const [updated] = await db.update(posts).set(patch).where(eq(posts.id, post.id)).returning();
  return ok(updated);
}

/** Borrar un post (autor o productor). Elimina también sus comentarios. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [post] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1);
  if (!post) return fail("Publicación no encontrada", 404);

  const m = await getMembership(post.communityId, me.id);
  if (!canManage(me.platformRole, m?.role) && post.authorId !== me.id) return fail("No autorizado", 403);

  await db.delete(comments).where(eq(comments.postId, post.id));
  await db.delete(posts).where(eq(posts.id, post.id));
  return ok({ deleted: true });
}
