import { db } from "@/db";
import { pointEvents, memberships, users } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { ok, fail } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { resolveCommunity, canReadCommunity } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Leaderboard por ventana: ?range=7d | 30d | all
 * - all-time: usa memberships.points (acumulado)
 * - 7d/30d: suma point_events dentro de la ventana
 */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  // El feed/los miembros/el ranking son contenido interno: publico solo si la
  // comunidad es publica Y gratuita. Si cobra o es privada, hace falta ser
  // miembro activo (o gestor / super admin).
  const me = await currentUser();
  if (!(await canReadCommunity(c, me))) {
    return fail(me ? "Debes ser miembro activo de esta comunidad" : "No autenticado", me ? 403 : 401);
  }


  const range = new URL(req.url).searchParams.get("range") ?? "all";

  if (range === "all") {
    const rows = await db
      .select({
        userId: memberships.userId,
        points: memberships.points,
        level: memberships.level,
        displayName: users.displayName,
        handle: users.handle,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.communityId, c.id))
      .orderBy(desc(memberships.points))
      .limit(50);
    return ok({ range, entries: rows });
  }

  const days = range === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      userId: pointEvents.userId,
      points: sql<number>`sum(${pointEvents.delta})::int`,
      displayName: users.displayName,
      handle: users.handle,
    })
    .from(pointEvents)
    .innerJoin(users, eq(pointEvents.userId, users.id))
    .where(and(eq(pointEvents.communityId, c.id), gte(pointEvents.createdAt, since)))
    .groupBy(pointEvents.userId, users.displayName, users.handle)
    .orderBy(desc(sql`sum(${pointEvents.delta})`))
    .limit(50);

  return ok({ range, entries: rows });
}
