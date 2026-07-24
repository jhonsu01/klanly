import { z } from "zod";
import { db } from "@/db";
import { payoutMethods } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  type: z.enum(["nequi", "bancolombia", "paypal", "bank", "otro"]),
  details: z.string().min(3).max(200), // número, correo o cuenta
});

// Configura/actualiza dónde el usuario recibe sus comisiones (upsert)
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const [existing] = await db.select().from(payoutMethods).where(eq(payoutMethods.userId, me.id)).limit(1);
  if (existing) {
    await db
      .update(payoutMethods)
      .set({ type: parsed.data.type, details: parsed.data.details, updatedAt: new Date() })
      .where(eq(payoutMethods.userId, me.id));
  } else {
    await db.insert(payoutMethods).values({ userId: me.id, type: parsed.data.type, details: parsed.data.details });
  }
  return ok({ saved: true });
}
