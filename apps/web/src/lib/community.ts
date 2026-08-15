import { db } from "@/db";
import { communities, memberships } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resuelve una comunidad por id (uuid) o por slug. */
export async function resolveCommunity(key: string) {
  const [c] = await db
    .select()
    .from(communities)
    .where(UUID.test(key) ? or(eq(communities.id, key), eq(communities.slug, key)) : eq(communities.slug, key))
    .limit(1);
  return c ?? null;
}

export async function getMembership(communityId: string, userId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, communityId), eq(memberships.userId, userId)))
    .limit(1);
  return m ?? null;
}

export function isManagerRole(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

/** ¿El usuario puede gestionar (crear cursos/posts, moderar) esta comunidad? */
export function canManage(platformRole: string, membershipRole?: string | null): boolean {
  return platformRole === "admin" || isManagerRole(membershipRole);
}

/**
 * ¿Puede este usuario LEER el contenido interno de la comunidad
 * (feed, miembros, ranking)?
 *
 * Una comunidad pública Y gratuita es una vitrina abierta. En cuanto cobra
 * —o es privada— el contenido es para miembros activos, sus gestores y el
 * super admin. Los datos publicos de la comunidad (nombre, precio, nº de
 * miembros) siguen expuestos en GET /api/communities/[slug]: eso es el
 * escaparate, no el contenido.
 */
export async function canReadCommunity(
  c: { id: string; isPublic: boolean | null; priceCents: number; billingPeriod: string },
  me: { id: string; platformRole: string } | null,
): Promise<boolean> {
  const isFree = c.priceCents === 0 || c.billingPeriod === "free";
  if (c.isPublic && isFree) return true;
  if (!me) return false;
  if (me.platformRole === "admin") return true;
  const m = await getMembership(c.id, me.id);
  return !!m && (m.status === "active" || isManagerRole(m.role));
}
