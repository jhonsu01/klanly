import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().min(6).max(6) });

// Desactiva el 2FA (requiere un código válido actual).
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (!me.totpSecret) return fail("El 2FA no está activo", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);
  if (!verifyTotp(parsed.data.code, me.totpSecret)) return fail("Código incorrecto", 400);

  await db.update(users).set({ totpSecret: null }).where(eq(users.id, me.id));
  return ok({ disabled: true });
}
