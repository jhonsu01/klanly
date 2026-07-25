import { db } from "@/db";
import { communities, users, memberships, paymentOrders } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Super admin: todas las comunidades con dueño, miembros e ingresos
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.platformRole !== "admin") return fail("Solo el super admin", 403);

  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      priceCents: communities.priceCents,
      currency: communities.currency,
      isPublic: communities.isPublic,
      createdAt: communities.createdAt,
      ownerName: users.displayName,
      ownerEmail: users.email,
      members: sql<number>`(select count(*) from ${memberships} m where m.community_id = ${communities.id})::int`,
      revenueCents: sql<number>`(select coalesce(sum(o.amount_cents),0) from ${paymentOrders} o where o.community_id = ${communities.id} and o.status = 'paid')::int`,
    })
    .from(communities)
    .innerJoin(users, eq(communities.ownerId, users.id))
    .orderBy(desc(communities.createdAt))
    .limit(300);

  return ok(rows);
}
