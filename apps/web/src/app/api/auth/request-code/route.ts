import { currentUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { issueCode } from "@/lib/codes";
import { sendEmail, emailTemplate } from "@/lib/mailer";
import { stepUpMethod } from "@/lib/stepup";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pide una confirmación para una acción sensible.
// Si el usuario tiene 2FA -> responde { method: "totp" } (usa su app de autenticación).
// Si no -> envía un PIN de 6 dígitos por correo y responde { method: "email" }.
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const method = stepUpMethod(me);
  if (method === "totp") return ok({ method });

  const rl = rateLimit(`stepup:${clientIp(req)}`, 4, 60_000);
  if (!rl.ok) return fail("Espera un momento antes de pedir otro código.", 429);

  const code = await issueCode(me.id, "step_up", 15);
  await sendEmail(me.email, "Código de confirmación · Klanly", emailTemplate(
    "Confirma tu acción",
    `Estás por realizar un cambio sensible en tu cuenta.<br/>Tu código de confirmación es: <b style="font-size:22px;letter-spacing:3px">${code}</b><br/>Vence en 15 minutos. Si no fuiste tú, cambia tu contraseña.`,
  ));
  return ok({ method });
}
