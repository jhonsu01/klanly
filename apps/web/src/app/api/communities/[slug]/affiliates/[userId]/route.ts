import { z } from "zod";
import { db } from "@/db";
import { communityAffiliates, notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ decision: z.enum(["approve", "reject"]) });

// Productor autoriza (o rechaza) a un afiliado
export async function PATCH(req: Request, { params }: { params: { slug: string; userId: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);
  const m = await getMembership(c.id, me.id);
  if (!canManage(me.platformRole, m?.role)) return fail("Solo el productor", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [aff] = await db
    .select()
    .from(communityAffiliates)
    .where(and(eq(communityAffiliates.communityId, c.id), eq(communityAffiliates.userId, params.userId)))
    .limit(1);
  if (!aff) return fail("Afiliado no encontrado", 404);

  const status = parsed.data.decision === "approve" ? "approved" : "rejected";
  await db
    .update(communityAffiliates)
    .set({ status, approvedBy: me.id })
    .where(eq(communityAffiliates.id, aff.id));

  await db.insert(notifications).values({
    userId: params.userId,
    communityId: c.id,
    type: "affiliate_status",
    body: status === "approved"
      ? `Fuiste aprobado como afiliado de ${c.name}. Ya puedes compartir tu link.`
      : `Tu solicitud de afiliado en ${c.name} fue rechazada.`,
  });

  return ok({ userId: params.userId, status });
}
