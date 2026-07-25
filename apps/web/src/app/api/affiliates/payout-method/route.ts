import { z } from "zod";
import { db } from "@/db";
import { payoutMethods } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { verifyStepUp } from "@/lib/stepup";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  type: z.enum(["nequi", "bancolombia", "daviplata", "paypal", "bank", "otro"]),
  accountName: z.string().max(120).optional(), // nombre del titular (opcional)
  details: z.string().min(3).max(200), // número de cuenta / llave / correo
  code: z.string().min(6).max(6), // confirmación step-up (correo o 2FA)
});

// Configura/actualiza dónde el usuario recibe sus comisiones (upsert).
// Acción sensible: exige confirmación por PIN de correo o 2FA.
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos o falta el código de confirmación (6 dígitos).", 422);

  const stepOk = await verifyStepUp(me, parsed.data.code);
  if (!stepOk) return fail("Código de confirmación incorrecto o vencido.", 400, { needsCode: true });

  const [existing] = await db.select().from(payoutMethods).where(eq(payoutMethods.userId, me.id)).limit(1);
  if (existing) {
    await db
      .update(payoutMethods)
      .set({ type: parsed.data.type, accountName: parsed.data.accountName ?? null, details: parsed.data.details, updatedAt: new Date() })
      .where(eq(payoutMethods.userId, me.id));
  } else {
    await db.insert(payoutMethods).values({ userId: me.id, type: parsed.data.type, accountName: parsed.data.accountName, details: parsed.data.details });
  }
  return ok({ saved: true });
}
