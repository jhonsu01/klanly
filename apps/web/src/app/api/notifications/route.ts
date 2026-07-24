import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Notificaciones del usuario actual + contador de no leídas
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, me.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, me.id), eq(notifications.read, false)));

  return ok({ unread, items: rows });
}
