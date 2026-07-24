import { z } from "zod";
import { db } from "@/db";
import { users, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ decision: z.enum(["approve", "reject"]) });

/**
 * Super admin aprueba/rechaza a un productor.
 * approve -> producerStatus=approved + platformRole=producer (puede publicar).
 * reject  -> producerStatus=rejected.
 */
export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.platformRole !== "admin") return fail("Solo el super admin", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [target] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  if (!target) return fail("Usuario no encontrado", 404);

  if (parsed.data.decision === "approve") {
    await db.update(users).set({ producerStatus: "approved", platformRole: target.platformRole === "admin" ? "admin" : "producer" }).where(eq(users.id, target.id));
    await db.insert(notifications).values({ userId: target.id, type: "producer_approved", body: "¡Fuiste aprobado como productor! Ya puedes publicar comunidades." });
    return ok({ userId: target.id, status: "approved" });
  }

  await db.update(users).set({ producerStatus: "rejected" }).where(eq(users.id, target.id));
  await db.insert(notifications).values({ userId: target.id, type: "producer_rejected", body: "Tu solicitud de productor fue rechazada." });
  return ok({ userId: target.id, status: "rejected" });
}
