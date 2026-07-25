// Helper de cliente para llamar la API (uso en componentes "use client").
export async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store", // evita respuestas cacheadas (p. ej. listas del admin desactualizadas)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json.data;
}

/**
 * Pide la confirmación "step-up" para una acción sensible.
 * Si el usuario tiene 2FA pide el código de su app; si no, el servidor le envía
 * un PIN al correo y aquí se lo pedimos. Devuelve null si cancela.
 */
export async function askStepUp(accion = "este cambio"): Promise<string | null> {
  const { method } = await api("/auth/request-code", "POST");
  const msg = method === "totp"
    ? `Para confirmar ${accion}, ingresa el código de 6 dígitos de tu app de autenticación (2FA):`
    : `Para confirmar ${accion} te enviamos un código de 6 dígitos a tu correo. Ingrésalo:`;
  const code = (window.prompt(msg) || "").trim();
  return code.length === 6 ? code : null;
}

export function money(cents: number, currency = "USD") {
  const amount = cents / 100;
  if (currency === "COP") return `$${Math.round(amount).toLocaleString("es-CO")} COP`;
  const s = amount % 1 === 0 ? amount.toLocaleString("en-US") : amount.toFixed(2);
  return `$${s} USD`;
}

// Sube una imagen a /api/upload y devuelve su URL pública.
// Comprime en el navegador antes de enviar (fotos de celular / HEIC del iPhone).
export async function uploadFile(file: File, folder = "uploads"): Promise<string> {
  const { compressImage } = await import("@/lib/image");
  const small = await compressImage(file);
  const fd = new FormData();
  fd.append("file", small);
  const res = await fetch(`/api/upload?folder=${folder}`, { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json.data.url as string;
}
