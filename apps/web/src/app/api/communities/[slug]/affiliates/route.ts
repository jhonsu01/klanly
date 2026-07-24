import { randomBytes } from "crypto";
import { db } from "@/db";
import { communityAffiliates, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Productor: lista de afiliados (solicitudes + aprobados)
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);
  const m = await getMembership(c.id, me.id);
  if (!canManage(me.platformRole, m?.role)) return fail("Solo el productor", 403);

  const rows = await db
    .select({
      userId: communityAffiliates.userId,
      code: communityAffiliates.code,
      status: communityAffiliates.status,
      createdAt: communityAffiliates.createdAt,
      displayName: users.displayName,
      handle: users.handle,
    })
    .from(communityAffiliates)
    .innerJoin(users, eq(communityAffiliates.userId, users.id))
    .where(eq(communityAffiliates.communityId, c.id))
    .orderBy(desc(communityAffiliates.createdAt));
  return ok(rows);
}

// Usuario: aplicar para ser afiliado de esta comunidad
export async function POST(_req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);
  if (!c.affiliateEnabled) return fail("Esta comunidad no tiene programa de afiliados", 400);

  const [existing] = await db
    .select()
    .from(communityAffiliates)
    .where(and(eq(communityAffiliates.communityId, c.id), eq(communityAffiliates.userId, me.id)))
    .limit(1);
  if (existing) return ok({ code: existing.code, status: existing.status, alreadyApplied: true });

  const code = `${c.slug.slice(0, 8)}-${randomBytes(4).toString("hex")}`;
  const [row] = await db
    .insert(communityAffiliates)
    .values({ communityId: c.id, userId: me.id, code, status: "pending" })
    .returning();

  return ok({ code: row.code, status: row.status }, 201);
}
