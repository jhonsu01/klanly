import { db } from "@/db";
import { communities, memberships } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ok, fail } from "@/lib/http";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const [c] = await db.select().from(communities).where(eq(communities.slug, params.slug)).limit(1);
  if (!c) return fail("Comunidad no encontrada", 404);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.communityId, c.id));

  // Membresía del usuario actual (si está autenticado)
  let myMembership: { role: string; status: string; level: number; points: number } | null = null;
  const me = await currentUser();
  if (me) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.communityId, c.id), eq(memberships.userId, me.id)))
      .limit(1);
    if (m) myMembership = { role: m.role, status: m.status, level: m.level, points: m.points };
  }

  return ok({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    iconUrl: c.iconUrl,
    priceCents: c.priceCents,
    currency: c.currency,
    billingPeriod: c.billingPeriod,
    memberCount: count,
    myMembership,
  });
}
