import { verifyTotp } from "@/lib/totp";
import { consumeCode } from "@/lib/codes";

/**
 * Verifica una confirmación "step-up" para acciones sensibles.
 * Si el usuario tiene 2FA activo, exige un código TOTP válido.
 * Si no, exige el PIN de 6 dígitos enviado por correo (purpose "step_up").
 */
export async function verifyStepUp(
  me: { id: string; totpSecret?: string | null },
  code: string | undefined | null,
): Promise<boolean> {
  if (!code) return false;
  if (me.totpSecret) return verifyTotp(code, me.totpSecret);
  return consumeCode(me.id, "step_up", code);
}

/** Indica qué método de confirmación aplica al usuario. */
export function stepUpMethod(me: { totpSecret?: string | null }): "totp" | "email" {
  return me.totpSecret ? "totp" : "email";
}
