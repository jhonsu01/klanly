import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser, verifyPassword, hashPassword } from "@/lib/auth";
import { verifyStepUp } from "@/lib/stepup";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  code: z.string().min(6).max(6),
});

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Faltan datos o el código de confirmación (6 dígitos).", 422);

  const stepOk = await verifyStepUp(me, parsed.data.code);
  if (!stepOk) return fail("Código de confirmación incorrecto o vencido.", 400, { needsCode: true });

  const okPass = await verifyPassword(parsed.data.currentPassword, me.passwordHash);
  if (!okPass) return fail("La contraseña actual es incorrecta", 400);

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, me.id));
  return ok({ changed: true });
}
