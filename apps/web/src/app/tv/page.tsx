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

type Estado = {
  pin: string;
  channel: string;
  paired: boolean;
};

const LS_ID = "klanly_tv_device_id";
const LS_SECRET = "klanly_tv_device_secret";

/**
 * Pantalla para televisor.
 *
 * Guarda su identidad (deviceId + secreto) en el navegador. Al recargarse —el
 * botón atrás del mando, un reinicio del televisor— RECUPERA el mismo canal en
 * vez de pedir uno nuevo. Antes pedía dispositivo nuevo en cada carga: el PIN
 * cambiaba, el celular seguía enviando al canal viejo y la pantalla se quedaba
 * en blanco aunque el envío respondiera correctamente.
 */
export default function TvPage() {
  const [est, setEst] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Registrarse o recuperar la identidad ──────────────────────────────────
  const registrar = useCallback(async () => {
    setError(null);
    try {
      const cuerpo: Record<string, string> = { label: "TV" };
      const id = localStorage.getItem(LS_ID);
      const secret = localStorage.getItem(LS_SECRET);
      if (id && secret) { cuerpo.deviceId = id; cuerpo.deviceSecret = secret; }

      const r = await fetch("/api/cast/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo conectar");

      localStorage.setItem(LS_ID, j.data.deviceId);
      localStorage.setItem(LS_SECRET, j.data.deviceSecret);
      setEst({ pin: j.data.pin, channel: j.data.channel, paired: !!j.data.paired });

      // Mientras NO esté emparejada hay que refrescar el PIN al caducar. Si ya
      // lo está, el PIN no se toca: el celular envía por el emparejamiento.
      if (reintento.current) clearTimeout(reintento.current);
      if (!j.data.paired) {
        reintento.current = setTimeout(registrar, Math.max(30, j.data.expiresInSeconds - 5) * 1000);
      }
    } catch (e: any) {
      setError(e.message);
      // La TV puede arrancar antes que el WiFi: se insiste sin tocar el mando
      if (reintento.current) clearTimeout(reintento.current);
      reintento.current = setTimeout(registrar, 5000);
    }
  }, []);

  useEffect(() => {
    registrar();
    return () => { if (reintento.current) clearTimeout(reintento.current); };
  }, [registrar]);

  // ── Escuchar el canal (se resuscribe si cambia) ───────────────────────────
  useEffect(() => {
    const canal = est?.channel;
    if (!canal || !realtimeEnabled()) return;
    const p = getPusherClient();
    if (!p) return;
    const ch = p.subscribe(canal);
    ch.bind("play", (data: Orden) => setOrden(data));
    ch.bind("stop", () => setOrden(null));
    return () => { ch.unbind_all(); p.unsubscribe(canal); };
  }, [est?.channel]);

  // Al recibir la primera orden, la pantalla ya está emparejada
  useEffect(() => {
    if (orden) setEst((e) => (e && !e.paired ? { ...e, paired: true } : e));
  }, [orden]);

  // La pantalla no debe apagarse en medio de una serie
  useEffect(() => {
    let lock: any = null;
    (async () => {
      if (!orden) return;
      try { lock = await (navigator as any).wakeLock?.request("screen"); } catch {}
    })();
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

  // ── Esperando ─────────────────────────────────────────────────────────────
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
      ) : !est ? (
        <div className="tv-msg">Conectando…</div>
      ) : est.paired ? (
        /* Ya emparejada: no se muestra el PIN, solo que está lista */
        <>
          <div className="tv-listo">✓ Pantalla lista</div>
          <div className="tv-hint">
            Elige un entrenamiento en el celular y pulsa <b>Ver en la TV</b>
          </div>
          <div className="tv-pin-chico">
            Si necesitas volver a emparejar, el código es <b>{est.pin}</b>
          </div>
        </>
      ) : (
        <>
          <div className="tv-hint">Escribe este código en tu celular</div>
          <div className="tv-pin">{est.pin.slice(0, 3)}<span>·</span>{est.pin.slice(3)}</div>
          <div className="tv-pasos">
            <span><b>1</b> Abre Klanly en el celular</span>
            <span><b>2</b> Entra a una lección de entrenamiento</span>
            <span><b>3</b> Pulsa <b>Ver en la TV</b> y escribe el código</span>
          </div>
        </>
      )}

      {!realtimeEnabled() && (
        <div className="tv-hint" style={{ color: "var(--red)" }}>
          Falta configurar el canal en tiempo real en el servidor
        </div>
      )}
    </div>
  );
}
