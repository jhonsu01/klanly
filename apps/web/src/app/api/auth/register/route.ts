import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { issueCode } from "@/lib/codes";
import { sendEmail, emailTemplate } from "@/lib/mailer";
import { ok, fail, slugify } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(80),
});

export async function POST(req: Request) {
  const rl = rateLimit(`register:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) return fail("Demasiados intentos. Espera un momento.", 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422, { issues: parsed.error.issues });
  const { email, password, displayName } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return fail("Ese email ya está registrado", 409);

  const handle = `${slugify(displayName)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const passwordHash = await hashPassword(password);

  const [u] = await db
    .insert(users)
    .values({ email, passwordHash, displayName, handle })
    .returning();

  const token = await createSession({ sub: u.id, email: u.email, role: u.platformRole });
  await setSessionCookie(token);

  // Enviar PIN de verificación de 6 dígitos
  const code = await issueCode(u.id, "verify_email", 30);
  await sendEmail(u.email, "Verifica tu cuenta en Klanly", emailTemplate(
    "Verifica tu cuenta",
    `Tu código de verificación es: <b style="font-size:22px;letter-spacing:3px">${code}</b><br/>Ingrésalo en la app para activar tu cuenta. Vence en 30 minutos.<br/><br/>Si este mensaje llegó a tu carpeta de Spam, márcalo como <b>“No es spam”</b> para recibir los próximos avisos (pagos aprobados, vencimientos) en tu bandeja de entrada.`,
  ));

  return ok({ id: u.id, email: u.email, displayName: u.displayName, handle: u.handle, role: u.platformRole, emailVerified: false }, 201);
}
