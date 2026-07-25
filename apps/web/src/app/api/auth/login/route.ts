import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  code: z.string().optional(), // código 2FA (si el usuario lo tiene activo)
});

export async function POST(req: Request) {
  const rl = rateLimit(`login:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return fail("Demasiados intentos. Espera un momento.", 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);
  const { email, password, code } = parsed.data;

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) return fail("Credenciales inválidas", 401);
  if (u.deletedAt) return fail("Esta cuenta fue eliminada.", 401);

  const okPass = await verifyPassword(password, u.passwordHash);
  if (!okPass) return fail("Credenciales inválidas", 401);

  // 2FA
  if (u.totpSecret) {
    if (!code) return ok({ requires2fa: true });
    if (!verifyTotp(code, u.totpSecret)) return fail("Código 2FA incorrecto", 401);
  }

  const token = await createSession({ sub: u.id, email: u.email, role: u.platformRole });
  await setSessionCookie(token);

  return ok({ id: u.id, email: u.email, displayName: u.displayName, handle: u.handle, role: u.platformRole });
}
