import { createHash, createHmac, randomBytes } from "crypto";

/**
 * Firma de integridad de órdenes de pago — reciclada del proyecto de rifas.
 *
 * En rifas, la referencia de la compra se firma para que ni el cliente ni la
 * pasarela puedan alterar el monto sin invalidar la firma. Aquí es idéntico:
 * la orden de membresía lleva una `reference` única + un `integrity_hash`.
 */

export function newReference(prefix = "kly"): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString("hex")}`;
}

/**
 * HMAC de integridad de la orden.
 * hash = HMAC_SHA256( reference + amountCents + currency , PAYMENTS_HMAC_SECRET )
 */
export function signOrder(reference: string, amountCents: number, currency: string): string {
  const secret = process.env.PAYMENTS_HMAC_SECRET;
  if (!secret) throw new Error("PAYMENTS_HMAC_SECRET no configurada");
  return createHmac("sha256", secret)
    .update(`${reference}${amountCents}${currency}`)
    .digest("hex");
}

export function verifyOrder(
  reference: string,
  amountCents: number,
  currency: string,
  hash: string,
): boolean {
  const expected = signOrder(reference, amountCents, currency);
  // comparación en tiempo (evita timing attacks básicos)
  return expected.length === hash.length && safeEqual(expected, hash);
}

function safeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Firma de integridad que exige Wompi en el Widget/checkout:
 * SHA256( reference + amountInCents + currency + WOMPI_INTEGRITY_SECRET )
 * (Wompi usa SHA256 plano, no HMAC — así lo hace también rifas.)
 */
export function wompiIntegritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
): string {
  const integrity = process.env.WOMPI_INTEGRITY_SECRET;
  if (!integrity) throw new Error("WOMPI_INTEGRITY_SECRET no configurada");
  return createHash("sha256")
    .update(`${reference}${amountInCents}${currency}${integrity}`)
    .digest("hex");
}
