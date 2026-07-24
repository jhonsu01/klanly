import { db } from "@/db";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Super admin: solicitudes de productor (pendientes + aprobados)
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.platformRole !== "admin") return fail("Solo el super admin", 403);

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      handle: users.handle,
      producerStatus: users.producerStatus,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(inArray(users.producerStatus, ["pending", "approved", "rejected"]))
    .limit(500);

  return ok(rows);
}
