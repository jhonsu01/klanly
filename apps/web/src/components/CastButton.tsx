"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";

/**
 * Envía la lección a una pantalla de TV emparejada por PIN.
 *
 * El PIN se guarda en el navegador: en la práctica siempre es la misma TV, así
 * que al segundo entrenamiento basta con pulsar el botón.
 */
export default function CastButton({
  lessonId,
  reps,
  onFlash,
}: {
  lessonId: string;
  reps?: number;
  onFlash?: (t: string, ok?: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const guardado = typeof window !== "undefined" ? localStorage.getItem("klanly_cast_pin") : null;

  const enviar = async (elPin: string) => {
    if (!/^\d{6}$/.test(elPin)) { onFlash?.("El PIN son 6 dígitos", false); return; }
    try {
      setBusy(true);
      const r = await api("/cast/play", "POST", { pin: elPin, lessonId, reps });
      localStorage.setItem("klanly_cast_pin", elPin);
      setAbierto(false); setPin("");
      onFlash?.(`Enviado a la TV${r?.label ? ` (${r.label})` : ""} ✔`);
    } catch (e: any) {
      // Si el PIN guardado ya no sirve, se olvida y se pide otro
      if (/vencido|válido/i.test(e.message)) localStorage.removeItem("klanly_cast_pin");
      onFlash?.(e.message, false);
    } finally { setBusy(false); }
  };

  return (
    <>
      <button
        className="ghost"
        style={{ marginTop: 0 }}
        disabled={busy}
        onClick={() => (guardado ? enviar(guardado) : setAbierto(true))}
        title="Ver en la TV"
      >
        📺 {busy ? "Enviando…" : "Ver en la TV"}
      </button>

      {abierto && (
        <div className="sheet-overlay" onClick={() => setAbierto(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, margin: "0 auto" }}>
            <div className="label">Emparejar la televisión</div>
            <p className="muted" style={{ margin: "8px 0 0", lineHeight: 1.6 }}>
              Abre <b>Klanly TV</b> en el televisor. Aparecerá un número de 6 dígitos:
              escríbelo aquí una sola vez.
            </p>

            <label className="label">PIN de la TV</label>
            <input
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              style={{ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".22em", textAlign: "center" }}
              autoFocus
            />

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button style={{ flex: 1 }} disabled={pin.length !== 6 || busy} onClick={() => enviar(pin)}>
                {busy ? "Enviando…" : "Emparejar y enviar"}
              </button>
              <button className="ghost" onClick={() => setAbierto(false)}>Cancelar</button>
            </div>

            {guardado && (
              <button
                className="ghost"
                style={{ width: "100%", marginTop: 10 }}
                onClick={() => { localStorage.removeItem("klanly_cast_pin"); onFlash?.("Pantalla olvidada"); setAbierto(false); }}
              >
                Olvidar la pantalla guardada
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
