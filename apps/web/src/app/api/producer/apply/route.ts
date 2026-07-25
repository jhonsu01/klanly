import { z } from "zod";
import { db } from "@/db";
import { users, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  planMonths: z.number().int().min(1).max(60),
  proofUrl: z.string().regex(/^(https?:|data:image\/)/).optional(),
});

/**
 * Un usuario solicita ser PRODUCTOR: elige un plan (1/3/6/12 meses), transfiere a
 * las cuentas del admin y sube su comprobante. Queda `pending` hasta que el super
 * admin verifique el pago y lo apruebe (con vigencia = ahora + meses del plan).
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Elige un plan válido", 422);

  await db.update(users).set({
    producerStatus: "pending",
    producerPlanMonths: parsed.data.planMonths,
    producerProofUrl: parsed.data.proofUrl ?? null,
  }).where(eq(users.id, me.id));

  const admins = await db.select({ id: users.id }).from(users).where(eq(users.platformRole, "admin"));
  for (const a of admins) {
    await db.insert(notifications).values({
      userId: a.id,
      type: "producer_application",
      body: `${me.displayName} (${me.email}) solicitó ser productor · plan ${parsed.data.planMonths} mes(es)${parsed.data.proofUrl ? " · adjuntó comprobante" : ""}.`,
    });
  }

  return ok({ status: "pending" }, 201);
}
