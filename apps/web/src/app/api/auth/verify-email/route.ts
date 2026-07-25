import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { consumeCode } from "@/lib/codes";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().min(6).max(6) });

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.emailVerified) return ok({ verified: true, already: true });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Código inválido", 422);

  const okCode = await consumeCode(me.id, "verify_email", parsed.data.code);
  if (!okCode) return fail("Código incorrecto o vencido", 400);

  await db.update(users).set({ emailVerified: true }).where(eq(users.id, me.id));
  return ok({ verified: true });
}
