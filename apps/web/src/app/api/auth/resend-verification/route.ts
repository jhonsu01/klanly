import { currentUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { issueCode } from "@/lib/codes";
import { sendEmail, emailTemplate } from "@/lib/mailer";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.emailVerified) return ok({ already: true });

  const rl = rateLimit(`resend:${clientIp(req)}`, 3, 60_000);
  if (!rl.ok) return fail("Espera un momento antes de reenviar.", 429);

  const code = await issueCode(me.id, "verify_email", 30);
  await sendEmail(me.email, "Verifica tu cuenta en Klanly", emailTemplate(
    "Verifica tu cuenta",
    `Tu código de verificación es: <b style="font-size:22px;letter-spacing:3px">${code}</b><br/>Vence en 30 minutos.<br/><br/>Si este mensaje llegó a tu carpeta de Spam, márcalo como <b>“No es spam”</b> para recibir los próximos avisos en tu bandeja de entrada.`,
  ));
  return ok({ sent: true });
}
