import { z } from "zod";
import { db } from "@/db";
import { users, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ proofUrl: z.string().url().optional(), note: z.string().max(300).optional() });

/**
 * Un usuario solicita ser PRODUCTOR (paga mensual a la plataforma para publicar
 * comunidades). Queda `pending` hasta que el super admin lo apruebe.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.producerStatus === "approved") return ok({ status: "approved", already: true });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const meta = parsed.success ? parsed.data : {};

  await db.update(users).set({ producerStatus: "pending" }).where(eq(users.id, me.id));

  // Notificar a los admins de plataforma
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.platformRole, "admin"));
  for (const a of admins) {
    await db.insert(notifications).values({
      userId: a.id,
      type: "producer_application",
      body: `${me.displayName} (${me.email}) solicitó ser productor.${(meta as any).proofUrl ? " Adjuntó comprobante." : ""}`,
    });
  }

  return ok({ status: "pending" }, 201);
}
