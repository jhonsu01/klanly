import { db } from "@/db";
import { users, memberships, communities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Perfil público por handle
export async function GET(_req: Request, { params }: { params: { handle: string } }) {
  const [u] = await db.select().from(users).where(eq(users.handle, params.handle)).limit(1);
  if (!u) return fail("Usuario no encontrado", 404);

  const coms = await db
    .select({
      slug: communities.slug,
      name: communities.name,
      role: memberships.role,
      level: memberships.level,
      points: memberships.points,
    })
    .from(memberships)
    .innerJoin(communities, eq(memberships.communityId, communities.id))
    .where(eq(memberships.userId, u.id))
    .limit(100);

  return ok({
    displayName: u.displayName,
    handle: u.handle,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    country: u.country,
    memberSince: u.createdAt,
    communities: coms,
  });
}
