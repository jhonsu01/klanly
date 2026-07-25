import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { consumeCode } from "@/lib/codes";
import { verifyTotp } from "@/lib/totp";
import { sendEmail, emailTemplate } from "@/lib/mailer";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
  newPassword: z.string().min(8),
});

/**
 * Paso 2 de "olvidé mi contraseña": cambia la contraseña con el código.
 * Acepta el PIN enviado al correo O, si el usuario tiene 2FA activo, el código
 * de su app de autenticación (así el 2FA sigue protegiendo la cuenta aunque
 * alguien tenga acceso al correo).
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos. La contraseña nueva necesita 8+ caracteres.", 422);

  const rl = rateLimit(`reset:${clientIp(req)}`, 6, 60_000);
  if (!rl.ok) return fail("Demasiados intentos. Espera un momento.", 429);

  const email = parsed.data.email.toLowerCase().trim();
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) return fail("Código incorrecto o vencido.", 400);

  const byTotp = !!u.totpSecret && verifyTotp(parsed.data.code, u.totpSecret);
  const byEmail = byTotp ? false : await consumeCode(u.id, "reset_password", parsed.data.code);
  if (!byTotp && !byEmail) return fail("Código incorrecto o vencido.", 400);

  const passwordHash = await hashPassword(parsed.data.newPassword);
  // Si recuperó la cuenta por correo, ese correo queda verificado de hecho.
  await db.update(users).set({ passwordHash, emailVerified: true }).where(eq(users.id, u.id));

  // Aviso de seguridad (no bloquea la respuesta si falla el correo)
  await sendEmail(u.email, "Tu contraseña fue cambiada · Klanly", emailTemplate(
    "Contraseña actualizada",
    "Acabas de cambiar la contraseña de tu cuenta de Klanly. Si no fuiste tú, restablécela de inmediato y activa el 2FA.",
  )).catch(() => {});

  return ok({ reset: true });
}
