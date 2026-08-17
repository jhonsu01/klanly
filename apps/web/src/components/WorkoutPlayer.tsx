"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseVideo } from "@/lib/video";

export type Workout = {
  repsPerRound: number;
  defaultReps: number;
  restSeconds: number;
  muted: boolean;
};

type Fase = "listo" | "entrenando" | "descanso" | "terminado";

/**
 * Reproductor en modo entrenamiento.
 *
 * El entrenador declara cuántas repeticiones trae el video (`repsPerRound`).
 * El alumno pide un objetivo y el reproductor repite el video las pasadas
 * necesarias: 10 repeticiones por video y objetivo 20 → dos pasadas, con
 * descanso entre ellas.
 *
 * Sobre el conteo: las **pasadas** son exactas (se cuentan por el evento de
 * fin del video). La repetición dentro de una pasada avanza proporcional al
 * tiempo, así que es una guía — la referencia real la marca el video.
 *
 * Soporta mp4 (control nativo) y YouTube (IFrame API). Vimeo no expone el fin
 * del video sin su propia librería, así que ahí se ofrece el video normal.
 */
export default function WorkoutPlayer({
  videoUrl,
  workout,
  onFinish,
  /** Vista para pantalla grande (Android TV): sin controles de ajuste. */
  bigScreen = false,
  /** Objetivo fijado desde fuera (cuando llega enviado desde el celular). */
  forcedReps,
  autoStart = false,
}: {
  videoUrl: string;
  workout: Workout;
  onFinish?: () => void;
  bigScreen?: boolean;
  forcedReps?: number;
  autoStart?: boolean;
}) {
  const video = parseVideo(videoUrl);
  const [objetivo, setObjetivo] = useState(forcedReps ?? workout.defaultReps);
  const [fase, setFase] = useState<Fase>("listo");
  const [pasada, setPasada] = useState(0);        // pasadas completadas
  const [progreso, setProgreso] = useState(0);    // 0..1 dentro de la pasada
  const [restante, setRestante] = useState(0);    // segundos de descanso

  const pasadas = Math.max(1, Math.ceil(objetivo / Math.max(1, workout.repsPerRound)));
  const repsHechas = Math.min(
    objetivo,
    pasada * workout.repsPerRound + Math.floor(progreso * workout.repsPerRound),
  );

  const fileRef = useRef<HTMLVideoElement | null>(null);
  const ytRef = useRef<any>(null);
  const ytHost = useRef<HTMLDivElement | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fin de una pasada: o descansa, o termina ──────────────────────────────
  const finPasada = useCallback(() => {
    setProgreso(0);
    setPasada((p) => {
      const hechas = p + 1;
      if (hechas >= pasadas) {
        setFase("terminado");
        onFinish?.();
      } else if (workout.restSeconds > 0) {
        setRestante(workout.restSeconds);
        setFase("descanso");
      } else {
        arrancarVideo();
      }
      return hechas;
    });
  }, [pasadas, workout.restSeconds, onFinish]);

  const arrancarVideo = useCallback(() => {
    setFase("entrenando");
    if (video?.kind === "file" && fileRef.current) {
      fileRef.current.currentTime = 0;
      fileRef.current.play().catch(() => {});
    } else if (ytRef.current) {
      ytRef.current.seekTo(0, true);
      ytRef.current.playVideo();
    }
  }, [video?.kind]);

  // ── Cuenta atrás del descanso ─────────────────────────────────────────────
  useEffect(() => {
    if (fase !== "descanso") return;
    const t = setInterval(() => {
      setRestante((r) => {
        if (r <= 1) { clearInterval(t); arrancarVideo(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [fase, arrancarVideo]);

  // ── YouTube: cargar la IFrame API una sola vez ────────────────────────────
  useEffect(() => {
    if (video?.kind !== "youtube" || !ytHost.current) return;
    let cancelado = false;

    const crear = () => {
      if (cancelado || !ytHost.current) return;
      const id = video.embedUrl.split("/embed/")[1]?.split("?")[0];
      if (!id) return;
      ytRef.current = new (window as any).YT.Player(ytHost.current, {
        videoId: id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, controls: bigScreen ? 0 : 1 },
        events: {
          onReady: (e: any) => {
            if (workout.muted) e.target.mute();
            if (autoStart) { setFase("entrenando"); e.target.playVideo(); }
          },
          // 0 = ENDED
          onStateChange: (e: any) => { if (e.data === 0) finPasada(); },
        },
      });
    };

    if ((window as any).YT?.Player) { crear(); return () => { cancelado = true; }; }

    // El script global avisa por una única función; encadenamos si ya existía.
    const anterior = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => { anterior?.(); crear(); };
    if (!document.getElementById("yt-iframe-api")) {
      const sc = document.createElement("script");
      sc.id = "yt-iframe-api";
      sc.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(sc);
    }
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.kind]);

  // ── YouTube: no emite progreso, lo sondeamos ──────────────────────────────
  useEffect(() => {
    if (video?.kind !== "youtube") return;
    if (fase !== "entrenando") { if (tick.current) clearInterval(tick.current); return; }
    tick.current = setInterval(() => {
      const p = ytRef.current;
      if (!p?.getDuration) return;
      const d = p.getDuration();
      if (d > 0) setProgreso(Math.min(1, p.getCurrentTime() / d));
    }, 500);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [fase, video?.kind]);

  const empezar = () => { setPasada(0); setProgreso(0); arrancarVideo(); };
  const pausar = () => {
    if (video?.kind === "file") fileRef.current?.pause();
    else ytRef.current?.pauseVideo();
    setFase("listo");
  };
  const reiniciar = () => { setPasada(0); setProgreso(0); setFase("listo"); };

  // Vimeo y enlaces sueltos: no podemos saber cuándo acaba el video
  if (video?.kind !== "file" && video?.kind !== "youtube") {
    return (
      <div className="wk-aviso">
        <div className="label" style={{ color: "var(--gold)" }}>Modo entrenamiento no disponible</div>
        <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
          El contador de repeticiones necesita saber cuándo termina el video, y eso
          solo se puede con <b>YouTube</b> o un archivo <b>.mp4</b>. Pide al
          entrenador que suba el video a YouTube.
        </p>
      </div>
    );
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const pct = Math.round((repsHechas / objetivo) * 100);

  return (
    <div className={`wk${bigScreen ? " wk-tv" : ""}`}>
      {/* Panel de conteo: lo que el alumno mira de reojo mientras entrena */}
      <div className="wk-hud">
        <div className="wk-reps">
          <span className="wk-n">{repsHechas}</span>
          <span className="wk-sep">/</span>
          <span className="wk-total">{objetivo}</span>
          <span className="label" style={{ marginLeft: 10 }}>Repeticiones</span>
        </div>
        <div className="wk-rondas">
          <span className="label">Pasada</span>
          <b className="m">{Math.min(pasada + (fase === "entrenando" ? 1 : 0), pasadas)} / {pasadas}</b>
        </div>
      </div>

      <div className="wk-barra"><i style={{ width: `${pct}%` }} /></div>

      {/* Video */}
      <div className="wk-video">
        {video.kind === "file" ? (
          <video
            ref={fileRef}
            src={video.src}
            muted={workout.muted}
            playsInline
            controls={!bigScreen}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgreso(v.currentTime / v.duration);
            }}
            onEnded={finPasada}
          />
        ) : (
          <div ref={ytHost} />
        )}

        {/* Descanso: tapa el video con la cuenta atrás */}
        {fase === "descanso" && (
          <div className="wk-overlay">
            <div className="label">Descanso</div>
            <div className="wk-cuenta">{mmss(restante)}</div>
            <div className="muted">Siguiente: pasada {pasada + 1} de {pasadas}</div>
            {!bigScreen && (
              <button className="ghost" onClick={arrancarVideo}>Saltar descanso</button>
            )}
          </div>
        )}

        {fase === "terminado" && (
          <div className="wk-overlay">
            <div className="wk-cuenta" style={{ color: "var(--green)" }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {objetivo} repeticiones completadas
            </div>
            {!bigScreen && <button onClick={reiniciar}>Otra vez</button>}
          </div>
        )}
      </div>

      {/* Controles (no en la TV: allí manda el celular) */}
      {!bigScreen && (
        <div className="wk-ctrl">
          {fase === "listo" && pasada === 0 && (
            <div className="wk-objetivo">
              <span className="label">Objetivo</span>
              <div className="wk-stepper">
                <button className="icon-btn" onClick={() => setObjetivo((r) => Math.max(workout.repsPerRound, r - workout.repsPerRound))}>−</button>
                <b className="m">{objetivo}</b>
                <button className="icon-btn" onClick={() => setObjetivo((r) => Math.min(5000, r + workout.repsPerRound))}>+</button>
              </div>
              <span className="meta">
                {pasadas} {pasadas === 1 ? "pasada" : "pasadas"} del video · {workout.repsPerRound} rep. cada una
              </span>
            </div>
          )}
          <div className="wk-botones">
            {fase === "entrenando"
              ? <button className="ghost" onClick={pausar}>Pausar</button>
              : <button onClick={empezar}>{pasada === 0 ? "Empezar" : "Continuar"}</button>}
            {pasada > 0 && fase !== "terminado" && (
              <button className="ghost" onClick={reiniciar}>Reiniciar</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
