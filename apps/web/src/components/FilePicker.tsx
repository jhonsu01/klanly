"use client";
import { useRef, useState } from "react";

type Props = {
  onPick: (file: File) => void;
  /** URL de la imagen ya subida (muestra vista previa) */
  value?: string;
  onClear?: () => void;
  label?: string;
  hint?: string;
  busy?: boolean;
  disabled?: boolean;
};

/**
 * Selector de archivo moderno: zona para arrastrar y soltar, botón propio,
 * vista previa de la imagen y botones cambiar/quitar.
 * Reemplaza el `<input type="file">` nativo (que se veía anticuado).
 */
export default function FilePicker({ onPick, value, onClear, label = "Subir imagen", hint = "PNG o JPG · se comprime automáticamente", busy, disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (f?: File | null) => { if (f && !disabled && !busy) onPick(f); };
  const open = () => { if (!disabled && !busy) ref.current?.click(); };

  if (value) {
    return (
      <div className="fp-preview">
        <img src={value} alt="vista previa" />
        <div className="fp-preview-actions">
          <div className="fp-ok">✓ Imagen lista</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ghost" style={{ marginTop: 0 }} onClick={open} disabled={busy}>Cambiar</button>
            {onClear && <button type="button" className="ghost" style={{ marginTop: 0 }} onClick={onClear} disabled={busy}>Quitar</button>}
          </div>
        </div>
        <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div
      className={`fp-drop${over ? " over" : ""}${disabled ? " disabled" : ""}`}
      onClick={open}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
    >
      <div className="fp-icon">{busy ? "⏳" : "🖼️"}</div>
      <div className="fp-label">{busy ? "Subiendo…" : label}</div>
      <div className="fp-hint">{busy ? "Un momento" : <>Arrastra la imagen aquí o <u>haz clic para elegir</u></>}</div>
      {!busy && <div className="fp-hint" style={{ marginTop: 2, opacity: .75 }}>{hint}</div>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
    </div>
  );
}
