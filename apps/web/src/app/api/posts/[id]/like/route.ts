import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership } from "@/lib/community";
import { awardPoints } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dar like a un post. Suma +1 punto al AUTOR (gamificación estilo Skool).
 * MVP: no persiste "quién dio like" (se añade en F3 con tabla de likes).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [post] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1);
  if (!post) return fail("Publicación no encontrada", 404);

  const m = await getMembership(post.communityId, me.id);
  if (!m || m.status !== "active") return fail("Debes ser miembro activo", 403);

  await db
    .update(posts)
    .set({ likeCount: sql`${posts.likeCount} + 1` })
    .where(eq(posts.id, post.id));

  // +1 punto al autor del post
  const g = await awardPoints(post.communityId, post.authorId, 1);

  return ok({ liked: true, authorLevel: g?.level ?? null, leveledUp: g?.leveledUp ?? false });
}
