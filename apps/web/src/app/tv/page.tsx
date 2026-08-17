"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WorkoutPlayer, { type Workout } from "@/components/WorkoutPlayer";
import { getPusherClient, realtimeEnabled } from "@/lib/pusher-client";
import { parseVideo } from "@/lib/video";

type Orden = {
  lessonId: string;
  title: string;
  courseTitle: string;
  videoUrl: string;
  kind: string;
  workout: Workout | null;
  reps: number | null;
  sentBy: string;
};

/**
 * Pantalla para televisor.
 *
 * No tiene sesión ni navegación: pide un PIN, espera, y reproduce lo que el
 * celular le manda. Todo se dimensiona con vw para que se lea desde el sofá.
 * Sin interacción => no hace falta navegación con el mando.
 */
export default function TvPage() {
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const canal = useRef<string | null>(null);

  // ── Pedir PIN al servidor ─────────────────────────────────────────────────
  const emparejar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/cast/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "TV" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo obtener el PIN");
      setPin(j.data.pin);
      canal.current = j.data.channel;
      // El PIN caduca: se pide otro solo, sin tocar el mando
      setTimeout(() => { setPin(null); emparejar(); }, (j.data.expiresInSeconds - 5) * 1000);
    } catch (e: any) {
      setError(e.message);
      setTimeout(emparejar, 5000); // la TV pudo arrancar antes que el WiFi
    }
  }, []);

  useEffect(() => { emparejar(); }, [emparejar]);

  // ── Escuchar el canal de esta pantalla ────────────────────────────────────
  useEffect(() => {
    if (!canal.current || !realtimeEnabled()) return;
    const p = getPusherClient();
    if (!p) return;
    const ch = p.subscribe(canal.current);
    ch.bind("play", (data: Orden) => setOrden(data));
    ch.bind("stop", () => setOrden(null));
    return () => { ch.unbind_all(); p.unsubscribe(canal.current!); };
  }, [pin]);

  // La pantalla no debe apagarse en medio de una serie
  useEffect(() => {
    let lock: any = null;
    const pedir = async () => {
      try { lock = await (navigator as any).wakeLock?.request("screen"); } catch {}
    };
    if (orden) pedir();
    return () => { try { lock?.release(); } catch {} };
  }, [orden]);

  // ── Reproduciendo ─────────────────────────────────────────────────────────
  if (orden) {
    const esEntrenamiento = orden.kind === "workout" && orden.workout;
    const v = parseVideo(orden.videoUrl);
    return (
      <div className="tv">
        <div className="tv-barra">
          <div>
            <div className="tv-curso">{orden.courseTitle}</div>
            <div className="tv-leccion">{orden.title}</div>
          </div>
          <div className="tv-quien">Enviado por {orden.sentBy}</div>
        </div>

        {esEntrenamiento ? (
          <WorkoutPlayer
            key={orden.lessonId + String(orden.reps)}
            videoUrl={orden.videoUrl}
            workout={orden.workout!}
            forcedReps={orden.reps ?? undefined}
            bigScreen
            autoStart
          />
        ) : v?.kind === "youtube" ? (
          <div className="tv-video">
            <iframe
              src={`${v.embedUrl}?autoplay=1&rel=0&modestbranding=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title={orden.title}
            />
          </div>
        ) : v?.kind === "file" ? (
          <div className="tv-video"><video src={v.src} autoPlay controls /></div>
        ) : (
          <div className="tv-espera"><div className="tv-msg">Esta lección no se puede ver en la TV</div></div>
        )}
      </div>
    );
  }

  // ── Esperando emparejamiento ──────────────────────────────────────────────
  return (
    <div className="tv tv-espera">
      <div className="tv-marca">
        <div className="tv-logo">K</div>
        <div>
          <div className="tv-nombre">Klanly</div>
          <div className="tv-sub">Entrenamiento en pantalla grande</div>
        </div>
      </div>

      {error ? (
        <div className="tv-msg">
          {error}
          <div className="tv-hint">Reintentando…</div>
        </div>
      ) : pin ? (
        <>
          <div className="tv-hint">Escribe este código en tu celular</div>
          <div className="tv-pin">{pin.slice(0, 3)}<span>·</span>{pin.slice(3)}</div>
          <div className="tv-pasos">
            <span><b>1</b> Abre Klanly en el celular</span>
            <span><b>2</b> Entra a una lección de entrenamiento</span>
            <span><b>3</b> Pulsa <b>Ver en la TV</b> y escribe el código</span>
          </div>
        </>
      ) : (
        <div className="tv-msg">Conectando…</div>
      )}

      {!realtimeEnabled() && (
        <div className="tv-hint" style={{ color: "var(--red)" }}>
          Falta configurar el canal en tiempo real en el servidor
        </div>
      )}
    </div>
  );
}
