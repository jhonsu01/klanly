"use client";

export type WkForm = {
  on: boolean;
  repsPerRound: string;
  defaultReps: string;
  restSeconds: string;
  muted: boolean;
};

/**
 * Ajustes del modo entrenamiento en el editor de la lección.
 *
 * La idea que tiene que quedar clara al entrenador: él declara cuántas
 * repeticiones trae SU video; el alumno decide cuántas quiere hacer y la app
 * repite el video las veces necesarias.
 */
export default function WorkoutFields({
  value,
  onChange,
  videoUrl,
}: {
  value: WkForm;
  onChange: (v: WkForm) => void;
  videoUrl?: string;
}) {
  const set = (patch: Partial<WkForm>) => onChange({ ...value, ...patch });
  const reps = Math.max(1, parseInt(value.repsPerRound || "1", 10));
  const obj = Math.max(1, parseInt(value.defaultReps || "1", 10));
  const pasadas = Math.ceil(obj / reps);

  // El contador necesita saber cuándo acaba el video: solo YouTube y .mp4
  const u = (videoUrl || "").trim();
  const compatible = !u || /youtube\.com|youtu\.be/.test(u) || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(u);

  return (
    <div className="wkf">
      <label className="wkf-switch">
        <input
          type="checkbox"
          checked={value.on}
          onChange={(e) => set({ on: e.target.checked })}
        />
        <span>
          <b>Modo entrenamiento</b>
          <span className="muted" style={{ display: "block", fontSize: 12.5, marginTop: 2 }}>
            Para ejercicios: el alumno elige cuántas repeticiones hacer y el video
            se repite las veces necesarias.
          </span>
        </span>
      </label>

      {value.on && (
        <div className="wkf-body">
          {!compatible && (
            <div className="wkf-aviso">
              El contador necesita detectar el fin del video, y eso solo funciona con
              <b> YouTube</b> o un archivo <b>.mp4</b>. Con otro tipo de enlace la
              lección se mostrará como video normal.
            </div>
          )}

          <div className="wkf-grid">
            <div>
              <label className="label">Repeticiones que trae el video</label>
              <input
                inputMode="numeric"
                value={value.repsPerRound}
                onChange={(e) => set({ repsPerRound: e.target.value.replace(/\D/g, "") })}
                placeholder="10"
              />
            </div>
            <div>
              <label className="label">Objetivo sugerido</label>
              <input
                inputMode="numeric"
                value={value.defaultReps}
                onChange={(e) => set({ defaultReps: e.target.value.replace(/\D/g, "") })}
                placeholder="20"
              />
            </div>
            <div>
              <label className="label">Descanso entre pasadas (seg)</label>
              <input
                inputMode="numeric"
                value={value.restSeconds}
                onChange={(e) => set({ restSeconds: e.target.value.replace(/\D/g, "") })}
                placeholder="30"
              />
            </div>
          </div>

          <label className="wkf-switch" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              checked={value.muted}
              onChange={(e) => set({ muted: e.target.checked })}
            />
            <span>Silenciar el video <span className="muted">(el alumno pone su propia música)</span></span>
          </label>

          <div className="wkf-preview">
            <span className="label">Así lo verá el alumno</span>
            <p>
              Objetivo de <b className="m">{obj}</b> repeticiones ={" "}
              <b className="m">{pasadas}</b> {pasadas === 1 ? "pasada" : "pasadas"} del video
              {value.restSeconds && parseInt(value.restSeconds, 10) > 0 && pasadas > 1
                ? <> con <b className="m">{value.restSeconds}s</b> de descanso entre cada una</>
                : null}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
