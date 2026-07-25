// Rate limiter en memoria (best-effort). En serverless cada instancia tiene su
// propio mapa: protege contra ráfagas dentro de una instancia caliente. Para
// robustez total en producción, usar Upstash/Redis.
type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const e = store.get(key);
  if (!e || e.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    if (store.size > 5000) for (const [k, v] of store) if (v.resetAt < now) store.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  e.count++;
  if (e.count > limit) return { ok: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}
