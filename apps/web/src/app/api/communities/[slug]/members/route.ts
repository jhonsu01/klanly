import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { resolveCommunity, canReadCommunity } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Directorio de miembros (con rol, nivel y puntos)
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  // El feed/los miembros/el ranking son contenido interno: publico solo si la
  // comunidad es publica Y gratuita. Si cobra o es privada, hace falta ser
  // miembro activo (o gestor / super admin).
  const me = await currentUser();
  if (!(await canReadCommunity(c, me))) {
    return fail(me ? "Debes ser miembro activo de esta comunidad" : "No autenticado", me ? 403 : 401);
  }


  const rows = await db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      status: memberships.status,
      level: memberships.level,
      points: memberships.points,
      joinedAt: memberships.joinedAt,
      displayName: users.displayName,
      handle: users.handle,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.communityId, c.id))
    .orderBy(desc(memberships.points))
    .limit(500);

  return ok(rows);
}
