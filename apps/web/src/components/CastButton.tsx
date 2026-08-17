"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";

const LS_DEVICE = "klanly_cast_device";

/**
 * Envía la lección a la pantalla de TV.
 *
 * Se guarda el `deviceId` de la pantalla, no el PIN: el PIN caduca a los 10
 * minutos y el emparejamiento dura horas, así que guardar el PIN hacía que
 * dejara de funcionar solo. Y siempre hay una vía visible para volver a
 * emparejar: antes, con un PIN guardado, el botón enviaba directo y no había
 * forma de escribir un código nuevo cuando la TV cambiaba el suyo.
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
  const [device, setDevice] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(LS_DEVICE) : null,
  );

  const enviar = async (payload: { pin?: string; deviceId?: string }) => {
    try {
      setBusy(true);
      const r = await api("/cast/play", "POST", { ...payload, lessonId, reps });
      if (r?.deviceId) {
        localStorage.setItem(LS_DEVICE, r.deviceId);
        setDevice(r.deviceId);
      }
      setAbierto(false); setPin("");
      onFlash?.(`Enviado a la TV${r?.label ? ` (${r.label})` : ""} ✔`);
    } catch (e: any) {
      // Si la pantalla dejó de estar emparejada, se olvida y se pide el PIN:
      // el usuario no se queda sin manera de reconectar.
      if (/emparejada|vencido|válido|PIN/i.test(e.message)) {
        localStorage.removeItem(LS_DEVICE);
        setDevice(null);
        setAbierto(true);
      }
      onFlash?.(e.message, false);
    } finally { setBusy(false); }
  };

  return (
    <>
      <span style={{ display: "inline-flex", gap: 4 }}>
        <button
          className="ghost"
          style={{ marginTop: 0 }}
          disabled={busy}
          onClick={() => (device ? enviar({ deviceId: device }) : setAbierto(true))}
          title="Ver en la TV"
        >
          📺 {busy ? "Enviando…" : "Ver en la TV"}
        </button>

        {/* Siempre hay salida para emparejar otra pantalla o meter un PIN nuevo */}
        {device && (
          <button
            className="icon-btn"
            style={{ width: 34, height: 34, fontSize: 13 }}
            onClick={() => setAbierto(true)}
            title="Emparejar otra pantalla"
            aria-label="Emparejar otra pantalla"
          >⇄</button>
        )}
      </span>

      {abierto && (
        <div className="sheet-overlay" onClick={() => setAbierto(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, margin: "0 auto" }}>
            <div className="label">Emparejar la televisión</div>
            <p className="muted" style={{ margin: "8px 0 0", lineHeight: 1.6 }}>
              Abre <b>Klanly TV</b> en el televisor y escribe aquí el código de 6
              dígitos que aparece en pantalla.
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
              <button style={{ flex: 1 }} disabled={pin.length !== 6 || busy} onClick={() => enviar({ pin })}>
                {busy ? "Enviando…" : "Emparejar y enviar"}
              </button>
              <button className="ghost" onClick={() => setAbierto(false)}>Cancelar</button>
            </div>

            {device && (
              <button
                className="ghost"
                style={{ width: "100%", marginTop: 10 }}
                onClick={() => {
                  localStorage.removeItem(LS_DEVICE); setDevice(null);
                  onFlash?.("Pantalla olvidada"); setAbierto(false);
                }}
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
