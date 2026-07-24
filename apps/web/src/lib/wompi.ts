import { createHash } from "crypto";

/**
 * Integración con Wompi — reciclada de la lógica de rifas.
 * - Construye los parámetros del checkout (Widget/redirect).
 * - Verifica la firma de los webhooks de eventos.
 */

const BASE = process.env.WOMPI_ENV === "prod"
  ? "https://production.wompi.co/v1"
  : "https://sandbox.wompi.co/v1";

export function wompiCheckoutParams(opts: {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySignature: string;
  redirectUrl: string;
  customerEmail?: string;
}) {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  if (!publicKey) throw new Error("WOMPI_PUBLIC_KEY no configurada");
  // Estos parámetros alimentan el Widget de Wompi en el frontend.
  return {
    publicKey,
    currency: opts.currency,
    amountInCents: opts.amountInCents,
    reference: opts.reference,
    signatureIntegrity: opts.integritySignature,
    redirectUrl: opts.redirectUrl,
    customerEmail: opts.customerEmail,
    checkoutUrl: "https://checkout.wompi.co/p/",
  };
}

/**
 * Verifica la firma del webhook de Wompi.
 * Wompi envía `signature.checksum` = SHA256( concatenación de las propiedades
 * indicadas en signature.properties + timestamp + WOMPI_EVENTS_SECRET ).
 */
export function verifyWompiEvent(body: any): boolean {
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
  if (!eventsSecret) throw new Error("WOMPI_EVENTS_SECRET no configurada");

  const signature = body?.signature;
  const timestamp = body?.timestamp;
  const data = body?.data;
  if (!signature?.checksum || !Array.isArray(signature?.properties) || !data) return false;

  let concat = "";
  for (const prop of signature.properties as string[]) {
    // prop es una ruta tipo "transaction.amount_in_cents"
    const value = prop.split(".").reduce((acc: any, key: string) => acc?.[key], data);
    concat += value ?? "";
  }
  concat += String(timestamp);
  concat += eventsSecret;

  const expected = createHash("sha256").update(concat).digest("hex");
  return expected.toLowerCase() === String(signature.checksum).toLowerCase();
}

/** Consulta el estado real de una transacción en Wompi (fuente de verdad). */
export async function getWompiTransaction(id: string) {
  const res = await fetch(`${BASE}/transactions/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data ?? null;
}
