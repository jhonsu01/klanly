import { z } from "zod";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getPlatformSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.platformRole !== "admin") return fail("Solo el super admin", 403);
  const s = await getPlatformSettings();
  return ok({ adminAccounts: s?.adminAccounts ?? [], producerPlans: s?.producerPlans ?? [] });
}

const Body = z.object({
  adminAccounts: z.array(z.object({ bank: z.string().max(60), number: z.string().max(60), name: z.string().max(80) })).max(8),
  producerPlans: z.array(z.object({
    label: z.string().max(40), months: z.number().int().min(1).max(60),
    priceCents: z.number().int().min(0), currency: z.string().max(5).default("USD"),
  })).max(8),
});

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  if (me.platformRole !== "admin") return fail("Solo el super admin", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422, { issues: parsed.error.issues });

  await getPlatformSettings(); // asegura que existe
  await db
    .update(platformSettings)
    .set({ adminAccounts: parsed.data.adminAccounts, producerPlans: parsed.data.producerPlans, updatedAt: new Date() })
    .where(eq(platformSettings.id, "default"));

  return ok({ saved: true });
}
