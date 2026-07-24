import { z } from "zod";
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
    isPublic: c.isPublic,
    memberCount: count,
    myMembership,
  });
}

const PatchBody = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().url().optional(),
  priceCents: z.number().int().min(0).optional(),
  billingPeriod: z.enum(["free", "month", "year", "one_time"]).optional(),
  isPublic: z.boolean().optional(),
});

// Editar la comunidad (solo owner o admin de plataforma)
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [c] = await db.select().from(communities).where(eq(communities.slug, params.slug)).limit(1);
  if (!c) return fail("Comunidad no encontrada", 404);

  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, c.id), eq(memberships.userId, me.id)))
    .limit(1);
  const isOwner = m?.role === "owner" || me.platformRole === "admin";
  if (!isOwner) return fail("Solo el owner puede editar la comunidad", 403);

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422, { issues: parsed.error.issues });

  const b = parsed.data;
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.description !== undefined) patch.description = b.description;
  if (b.iconUrl !== undefined) patch.iconUrl = b.iconUrl;
  if (b.isPublic !== undefined) patch.isPublic = b.isPublic;
  if (b.priceCents !== undefined) {
    patch.priceCents = b.priceCents;
    patch.billingPeriod = b.priceCents === 0 ? "free" : (b.billingPeriod ?? (c.billingPeriod === "free" ? "month" : c.billingPeriod));
  } else if (b.billingPeriod !== undefined) {
    patch.billingPeriod = b.billingPeriod;
  }

  if (Object.keys(patch).length === 0) return ok({ updated: false });
  const [updated] = await db.update(communities).set(patch).where(eq(communities.id, c.id)).returning();
  return ok(updated);
}
