"use client";

export type Resource = { kind: "link" | "image"; label: string; url: string };

const isHttp = (u: string) => /^https?:\/\/[^\s"'<>]+$/i.test(u.trim());

/** Dominio legible para mostrar junto al enlace ("youtube.com"). */
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "enlace externo"; }
}

/**
 * Material complementario de una lección: enlaces externos (se abren en el
 * navegador) e imágenes alojadas fuera (se muestran dentro de la lección).
 */
export function ResourceList({ items }: { items?: Resource[] | null }) {
  const list = (items ?? []).filter((r) => isHttp(r.url));
  if (list.length === 0) return null;

  const links = list.filter((r) => r.kind === "link");
  const images = list.filter((r) => r.kind === "image");

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>
        Material complementario
      </div>

      {links.length > 0 && (
        <div className="res-list">
          {links.map((r, i) => (
            <a key={i} className="res-link" href={r.url} target="_blank" rel="noopener noreferrer">
              <span aria-hidden>🔗</span>
              <span className="res-label">{r.label || r.url}</span>
              <span className="res-ext">{hostOf(r.url)} ↗</span>
            </a>
          ))}
        </div>
      )}

      {images.map((r, i) => (
        <figure key={i} style={{ margin: "14px 0 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.url} alt={r.label || "imagen"} loading="lazy"
               style={{ width: "100%", height: "auto", borderRadius: 10, border: "1px solid var(--border)" }} />
          {r.label && <figcaption className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>{r.label}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

/** Editor de la lista de recursos (lado del productor). */
export default function ResourceEditor({
  items,
  onChange,
}: {
  items: Resource[];
  onChange: (r: Resource[]) => void;
}) {
  const set = (i: number, patch: Partial<Resource>) =>
    onChange(items.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div style={{ marginTop: 6 }}>
      {items.map((r, i) => {
        const bad = r.url.trim() !== "" && !isHttp(r.url);
        return (
          <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <select
              value={r.kind}
              onChange={(e) => set(i, { kind: e.target.value as Resource["kind"] })}
              style={{ width: 110, marginTop: 0 }}
            >
              <option value="link">🔗 Enlace</option>
              <option value="image">🖼 Imagen</option>
            </select>
            <input
              style={{ flex: "1 1 130px", minWidth: 0, marginTop: 0 }}
              placeholder={r.kind === "image" ? "Descripción" : "Texto del enlace"}
              value={r.label}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <input
              style={{ flex: "2 1 180px", minWidth: 0, marginTop: 0, borderColor: bad ? "var(--red)" : undefined }}
              placeholder="https://…"
              value={r.url}
              onChange={(e) => set(i, { url: e.target.value })}
            />
            <button
              type="button" className="ghost" style={{ marginTop: 0, color: "#ffb4c4" }}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >✕</button>
            {bad && <div className="muted" style={{ color: "var(--red)", width: "100%", fontSize: 12 }}>La URL debe empezar por http:// o https://</div>}
          </div>
        );
      })}
      {items.length < 12 && (
        <button type="button" className="ghost" style={{ marginTop: 0 }}
                onClick={() => onChange([...items, { kind: "link", label: "", url: "" }])}>
          + Agregar enlace o imagen
        </button>
      )}
    </div>
  );
}
