import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/http";
import { resolveCommunity } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Directorio de miembros (con rol, nivel y puntos)
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

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
