"use client";
import { useState } from "react";

/**
 * Confirmación para acciones irreversibles: obliga a escribir "confirmo"
 * y avisa explícitamente de que no se podrá recuperar nada.
 */
export default function ConfirmDanger({
  title,
  detail,
  bullets = [],
  actionLabel = "Eliminar definitivamente",
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  detail: string;
  bullets?: string[];
  actionLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [text, setText] = useState("");
  const okToGo = text.trim().toLowerCase() === "confirmo";

  return (
    <div className="cd-overlay" onClick={onCancel}>
      <div className="cd-box" onClick={(e) => e.stopPropagation()}>
        <div className="cd-icon">⚠️</div>
        <h2 style={{ margin: "0 0 6px" }}>{title}</h2>
        <p className="muted" style={{ margin: 0 }}>{detail}</p>

        {bullets.length > 0 && (
          <ul className="cd-bullets">
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}

        <div className="cd-warn">
          Esta acción es <b>permanente</b>. Una vez hecha <b>no podrás recuperar nada</b>.
        </div>

        <label>Para continuar, escribe <b>confirmo</b></label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="confirmo"
          autoFocus
          autoComplete="off"
        />

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button className="cd-danger" disabled={!okToGo || busy} onClick={onConfirm}>
            {busy ? "Procesando…" : actionLabel}
          </button>
          <button className="ghost" style={{ marginTop: 0 }} onClick={onCancel} disabled={busy}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
