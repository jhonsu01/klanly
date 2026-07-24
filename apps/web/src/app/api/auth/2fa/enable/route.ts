import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ secret: z.string().min(10), code: z.string().min(6).max(6) });

// Activa el 2FA: verifica el código contra el secreto y lo persiste.
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  if (!verifyTotp(parsed.data.code, parsed.data.secret)) {
    return fail("Código incorrecto. Verifica la hora de tu dispositivo.", 400);
  }

  await db.update(users).set({ totpSecret: parsed.data.secret }).where(eq(users.id, me.id));
  return ok({ enabled: true });
}
