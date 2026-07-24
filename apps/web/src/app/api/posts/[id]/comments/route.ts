import { z } from "zod";
import { db } from "@/db";
import { posts, comments, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorName: users.displayName,
      authorHandle: users.handle,
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(eq(comments.postId, params.id))
    .orderBy(asc(comments.createdAt))
    .limit(200);
  return ok(rows);
}

const Body = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [post] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1);
  if (!post) return fail("Publicación no encontrada", 404);

  const m = await getMembership(post.communityId, me.id);
  if (!m || m.status !== "active") return fail("Debes ser miembro activo", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [c] = await db
    .insert(comments)
    .values({ postId: post.id, authorId: me.id, body: parsed.data.body })
    .returning();

  return ok(c, 201);
}
