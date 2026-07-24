import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { generateSecret, otpauthUrl } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Genera un secreto TOTP y la URL otpauth (para el QR). No lo persiste aún:
// el cliente lo confirma en /enable con un código válido.
export async function POST() {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const secret = generateSecret();
  const otpauth = otpauthUrl(me.email, secret);
  return ok({ secret, otpauth });
}
