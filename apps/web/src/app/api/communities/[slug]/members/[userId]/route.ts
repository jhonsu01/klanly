import { z } from "zod";
import { db } from "@/db";
import { memberships, auditLog } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  role: z.enum(["admin", "moderator", "member"]),
});

/**
 * Cambiar el rol de un miembro (gestión de usuarios).
 * Solo el OWNER de la comunidad (o admin de plataforma) puede hacerlo.
 * No se puede cambiar el rol del propio owner.
 */
export async function PATCH(req: Request, { params }: { params: { slug: string; userId: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const myM = await getMembership(c.id, me.id);
  const isOwner = myM?.role === "owner" || me.platformRole === "admin";
  if (!isOwner) return fail("Solo el owner puede cambiar roles", 403);

  const target = await getMembership(c.id, params.userId);
  if (!target) return fail("Miembro no encontrado", 404);
  if (target.role === "owner") return fail("No puedes cambiar el rol del owner", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  await db.update(memberships).set({ role: parsed.data.role }).where(eq(memberships.id, target.id));

  await db.insert(auditLog).values({
    actorId: me.id,
    action: "membership.role_changed",
    entity: "memberships",
    entityId: target.id,
    metadata: { to: parsed.data.role, userId: params.userId },
  });

  return ok({ userId: params.userId, role: parsed.data.role });
}
