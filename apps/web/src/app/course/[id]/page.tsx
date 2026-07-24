"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { parseVideo } from "@/lib/video";

type Lesson = {
  id: string; moduleName?: string | null; title: string; videoUrl?: string | null;
  content?: string | null; minLevel: number; position: number; completed: boolean; locked: boolean;
};
type CourseData = {
  course: { id: string; title: string; description?: string; minLevel: number };
  community: { slug: string; name: string } | null;
  lessons: Lesson[];
  progressPct: number;
  isManager: boolean;
  isMember: boolean;
  myLevel: number;
};

export default function CoursePage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [d, setD] = useState<CourseData | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ moduleName: "", title: "", videoUrl: "", content: "", minLevel: "1" });

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const data: CourseData = await api(`/courses/${id}`);
      setD(data);
      setSel((cur) => cur ?? data.lessons.find((l) => !l.completed && !l.locked)?.id ?? data.lessons[0]?.id ?? null);
    } catch (e: any) { flash(e.message, false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Agrupar lecciones por módulo, preservando el orden (secuencia)
  const modules = useMemo(() => {
    if (!d) return [] as { name: string; items: Lesson[] }[];
    const out: { name: string; items: Lesson[] }[] = [];
    for (const l of d.lessons) {
      const name = l.moduleName?.trim() || "General";
      let g = out.find((x) => x.name === name);
      if (!g) { g = { name, items: [] }; out.push(g); }
      g.items.push(l);
    }
    return out;
  }, [d]);

  if (!d) return <div className="container"><a href="/" className="muted">← Volver</a><p className="muted" style={{ marginTop: 20 }}>Cargando…</p></div>;

  const current = d.lessons.find((l) => l.id === sel) || null;
  const video = parseVideo(current?.videoUrl);

  const addLesson = async () => {
    try {
      await api(`/courses/${id}/lessons`, "POST", {
        title: form.title,
        moduleName: form.moduleName || undefined,
        videoUrl: form.videoUrl || undefined,
        content: form.content || undefined,
        minLevel: parseInt(form.minLevel || "1", 10),
      });
      setForm({ moduleName: "", title: "", videoUrl: "", content: "", minLevel: "1" });
      setShowAdd(false); flash("Lección agregada ✔"); load();
    } catch (e: any) { flash(e.message, false); }
  };
  const complete = async (lessonId: string) => {
    try {
      const r = await api(`/lessons/${lessonId}/complete`, "POST");
      flash(r.leveledUp ? `¡Completada! Subiste al nivel ${r.level} 🎉` : "Lección completada ✔");
      load();
    } catch (e: any) { flash(e.message, false); }
  };

  return (
    <div className="container">
      {d.community
        ? <a href={`/c/${d.community.slug}`} className="muted">← {d.community.name}</a>
        : <a href="/" className="muted">← Volver</a>}

      <div style={{ marginTop: 12 }}>
        <h1>{d.course.title}</h1>
        {d.course.description && <p className="muted" style={{ marginTop: 4 }}>{d.course.description}</p>}
        {/* Barra de progreso */}
        <div style={{ marginTop: 12, background: "#20202a", borderRadius: 999, height: 10, overflow: "hidden" }}>
          <div style={{ width: `${d.progressPct}%`, height: "100%", background: "linear-gradient(90deg,var(--accent),var(--accent2))" }} />
        </div>
        <div className="muted" style={{ marginTop: 4 }}>{d.progressPct}% completado · {d.lessons.length} lecciones</div>
      </div>

      {msg && <div className={`out ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      {d.isManager && (
        <div style={{ marginTop: 14 }}>
          <button className="ghost" style={{ marginTop: 0 }} onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Cancelar" : "+ Agregar lección"}
          </button>
          {showAdd && (
            <div className="card" style={{ marginTop: 10 }}>
              <label>Módulo (sección — agrupa lecciones en secuencia)</label>
              <input value={form.moduleName} onChange={(e) => setForm({ ...form, moduleName: e.target.value })} placeholder="Ej: Introducción" />
              <label>Título de la lección</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej: Cómo empezar" />
              <label>URL del video (YouTube no listado / oculto, Vimeo o .mp4)</label>
              <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://youtu.be/XXXXXXXXXXX" />
              <label>Contenido / notas (opcional)</label>
              <textarea rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Recursos, pasos, enlaces…" />
              <label>Desbloquear en nivel</label>
              <input value={form.minLevel} onChange={(e) => setForm({ ...form, minLevel: e.target.value })} placeholder="1" style={{ width: 80 }} />
              <div><button onClick={addLesson} disabled={!form.title}>Guardar lección</button></div>
            </div>
          )}
        </div>
      )}

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "300px 1fr" }}>
        {/* Lista de lecciones (secuencia por módulos) */}
        <div className="card" style={{ alignSelf: "start" }}>
          {d.lessons.length === 0 && <div className="muted">Este curso aún no tiene lecciones.</div>}
          {modules.map((mod) => (
            <div key={mod.name} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: ".5px", margin: "6px 0" }}>{mod.name}</div>
              {mod.items.map((l) => (
                <div
                  key={l.id}
                  onClick={() => !l.locked && setSel(l.id)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 10px", borderRadius: 8, cursor: l.locked ? "not-allowed" : "pointer",
                    background: sel === l.id ? "#24242f" : "transparent", opacity: l.locked ? 0.5 : 1,
                    fontSize: 14,
                  }}
                >
                  <span>{l.completed ? "✅ " : l.locked ? "🔒 " : "▶️ "}{l.title}</span>
                  {l.locked && <span className="muted" style={{ fontSize: 11 }}>Nv {l.minLevel}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Reproductor + contenido */}
        <div className="card">
          {!current && <div className="muted">Selecciona una lección.</div>}
          {current && (
            <>
              <h2 style={{ marginBottom: 12 }}>{current.title}</h2>
              {current.locked ? (
                <div className="muted">🔒 Esta lección se desbloquea en el nivel {current.minLevel} (tienes nivel {d.myLevel}).</div>
              ) : (
                <>
                  {video?.kind === "youtube" || video?.kind === "vimeo" ? (
                    <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden" }}>
                      <iframe
                        src={video.embedUrl}
                        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={current.title}
                      />
                    </div>
                  ) : video?.kind === "file" ? (
                    <video src={video.src} controls style={{ width: "100%", borderRadius: 10 }} />
                  ) : video?.kind === "link" ? (
                    <a href={video.href} target="_blank" rel="noreferrer"><button className="ghost">Abrir recurso ↗</button></a>
                  ) : (
                    <div className="muted">Esta lección no tiene video.</div>
                  )}

                  {current.content && <p style={{ marginTop: 14, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{current.content}</p>}

                  {d.isMember && (
                    <button
                      onClick={() => complete(current.id)}
                      disabled={current.completed}
                      style={{ background: current.completed ? "#24242f" : undefined }}
                    >
                      {current.completed ? "✅ Completada" : "Marcar como completada"}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
