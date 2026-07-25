import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { issueCode } from "@/lib/codes";
import { sendEmail, emailTemplate } from "@/lib/mailer";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email() });

/**
 * Paso 1 de "olvidé mi contraseña": envía un PIN de 6 dígitos al correo.
 * Responde SIEMPRE lo mismo exista o no la cuenta, para no revelar qué
 * correos están registrados (enumeración de usuarios).
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Correo inválido", 422);

  const rl = rateLimit(`forgot:${clientIp(req)}`, 4, 60_000);
  if (!rl.ok) return fail("Demasiados intentos. Espera un momento.", 429);

  const email = parsed.data.email.toLowerCase().trim();
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (u) {
    const code = await issueCode(u.id, "reset_password", 15);
    await sendEmail(u.email, "Restablece tu contraseña · Klanly", emailTemplate(
      "Restablece tu contraseña",
      `Pediste cambiar tu contraseña. Tu código es: <b style="font-size:22px;letter-spacing:3px">${code}</b><br/>Vence en 15 minutos.<br/><br/>` +
      (u.totpSecret ? `También puedes usar el código de tu app de autenticación (2FA).<br/><br/>` : "") +
      `Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.<br/><br/>` +
      `Si este mensaje llegó a tu carpeta de Spam, márcalo como <b>“No es spam”</b>.`,
    ));
  }

  return ok({ sent: true });
}
