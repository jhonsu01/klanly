import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getPlatformSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Planes y cuentas de pago que ve el usuario al aplicar como productor.
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  const s = await getPlatformSettings();
  return ok({ plans: s?.producerPlans ?? [], adminAccounts: s?.adminAccounts ?? [] });
}
