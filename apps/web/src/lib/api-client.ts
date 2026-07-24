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
