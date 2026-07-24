import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);
  const { email, password } = parsed.data;

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) return fail("Credenciales inválidas", 401);

  const okPass = await verifyPassword(password, u.passwordHash);
  if (!okPass) return fail("Credenciales inválidas", 401);

  const token = await createSession({ sub: u.id, email: u.email, role: u.platformRole });
  await setSessionCookie(token);

  return ok({ id: u.id, email: u.email, displayName: u.displayName, handle: u.handle, role: u.platformRole });
}
