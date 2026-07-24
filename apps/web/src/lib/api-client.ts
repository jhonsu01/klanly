// Helper de cliente para llamar la API (uso en componentes "use client").
export async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json.data;
}

export function money(cents: number, currency = "USD") {
  return `$${(cents / 100).toFixed(2)} ${currency}`;
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
