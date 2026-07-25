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

export function money(cents: number, currency = "USD") {
  const amount = cents / 100;
  if (currency === "COP") return `$${Math.round(amount).toLocaleString("es-CO")} COP`;
  const s = amount % 1 === 0 ? amount.toLocaleString("en-US") : amount.toFixed(2);
  return `$${s} USD`;
}

// Sube una imagen a /api/upload y devuelve su URL pública.
export async function uploadFile(file: File, folder = "uploads"): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/upload?folder=${folder}`, { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json.data.url as string;
}
