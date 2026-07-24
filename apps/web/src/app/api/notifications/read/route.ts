import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marcar todas las notificaciones como leídas
export async function POST() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, me.id), eq(notifications.read, false)));

  return ok({ marked: true });
}
