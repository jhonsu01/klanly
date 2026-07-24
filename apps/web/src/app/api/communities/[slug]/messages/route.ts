import { z } from "zod";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chat de comunidad (MVP por polling; el cliente refresca cada pocos segundos).
 * Realtime se añade luego con un proveedor externo (Pusher/Ably) porque las
 * funciones serverless de Vercel no mantienen conexiones WebSocket persistentes.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const m = await getMembership(c.id, me.id);
  if (!m || m.status !== "active") return fail("Debes ser miembro activo", 403);

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      authorName: users.displayName,
      authorHandle: users.handle,
    })
    .from(messages)
    .innerJoin(users, eq(messages.authorId, users.id))
    .where(eq(messages.communityId, c.id))
    .orderBy(asc(messages.createdAt))
    .limit(100);

  return ok(rows);
}

const Body = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const m = await getMembership(c.id, me.id);
  if (!m || m.status !== "active") return fail("Debes ser miembro activo", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [msg] = await db
    .insert(messages)
    .values({ communityId: c.id, authorId: me.id, body: parsed.data.body })
    .returning();

  return ok(msg, 201);
}
