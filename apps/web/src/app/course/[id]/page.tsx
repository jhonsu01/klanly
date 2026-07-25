"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, uploadFile } from "@/lib/api-client";
import FilePicker from "@/components/FilePicker";
import TopBar from "@/components/TopBar";
import { parseVideo } from "@/lib/video";

type Lesson = {
  id: string; moduleName?: string | null; title: string; videoUrl?: string | null;
  content?: string | null; minLevel: number; position: number; completed: boolean; locked: boolean;
};
type CourseData = {
  course: { id: string; title: string; description?: string; coverUrl?: string | null; minLevel: number };
  community: { slug: string; name: string } | null;
  lessons: Lesson[];
  progressPct: number;
  isManager: boolean;
  isMember: boolean;
  myLevel: number;
};

const empty = { moduleName: "", title: "", videoUrl: "", content: "", minLevel: "1" };

export default function CoursePage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [d, setD] = useState<CourseData | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);      // lessonId en edición
  const [editForm, setEditForm] = useState({ ...empty });
  const [editCourse, setEditCourse] = useState(false);
  const [cForm, setCForm] = useState({ title: "", description: "", coverUrl: "" });
  const [busy, setBusy] = useState(false);

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const data: CourseData = await api(`/courses/${id}`);
      setD(data);
      setCForm({ title: data.course.title, description: data.course.description || "", coverUrl: data.course.coverUrl || "" });
      setSel((cur) => cur ?? data.lessons.find((l) => !l.completed && !l.locked)?.id ?? data.lessons[0]?.id ?? null);
    } catch (e: any) { flash(e.message, false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

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

  if (!d) return <div className="container"><TopBar backHref="/" /><p className="muted">Cargando…</p></div>;

  const current = d.lessons.find((l) => l.id === sel) || null;
  const video = parseVideo(current?.videoUrl);
  const idx = d.lessons.findIndex((l) => l.id === sel);
  const prevLesson = idx > 0 ? d.lessons[idx - 1] : null;
  const nextLesson = idx >= 0 && idx < d.lessons.length - 1 ? d.lessons[idx + 1] : null;
  const goto = (id?: string) => { if (id) { setSel(id); setEditing(null); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); } };

  const onPickImage = async (file: File | undefined, apply: (url: string) => void) => {
    if (!file) return;
    try { setBusy(true); const url = await uploadFile(file, "covers"); apply(url); flash("Imagen subida ✔"); }
    catch (e: any) { flash(e.message, false); } finally { setBusy(false); }
  };

  const addLesson = async () => {
    try {
      await api(`/courses/${id}/lessons`, "POST", {
        title: form.title, moduleName: form.moduleName || undefined,
        videoUrl: form.videoUrl || undefined, content: form.content || undefined,
        minLevel: parseInt(form.minLevel || "1", 10),
      });
      setForm({ ...empty }); setShowAdd(false); flash("Lección agregada ✔"); load();
    } catch (e: any) { flash(e.message, false); }
  };
  const complete = async (lessonId: string) => {
    try { const r = await api(`/lessons/${lessonId}/complete`, "POST"); flash(r.leveledUp ? `¡Completada! Nivel ${r.level} 🎉` : "Lección completada ✔"); load(); }
    catch (e: any) { flash(e.message, false); }
  };
  const startEdit = (l: Lesson) => { setEditing(l.id); setEditForm({ moduleName: l.moduleName || "", title: l.title, videoUrl: l.videoUrl || "", content: l.content || "", minLevel: String(l.minLevel) }); };
  const saveEdit = async (lessonId: string) => {
    try {
      await api(`/lessons/${lessonId}`, "PATCH", {
        title: editForm.title, moduleName: editForm.moduleName, videoUrl: editForm.videoUrl,
        content: editForm.content, minLevel: parseInt(editForm.minLevel || "1", 10),
      });
      setEditing(null); flash("Lección actualizada ✔"); load();
    } catch (e: any) { flash(e.message, false); }
  };
  const delLesson = async (lessonId: string) => { try { await api(`/lessons/${lessonId}`, "DELETE"); if (sel === lessonId) setSel(null); flash("Lección borrada"); load(); } catch (e: any) { flash(e.message, false); } };
  const move = async (lessonId: string, dir: "up" | "down") => { try { await api(`/lessons/${lessonId}`, "PATCH", { move: dir }); load(); } catch (e: any) { flash(e.message, false); } };
  const saveCourse = async () => {
    try { await api(`/courses/${id}`, "PATCH", { title: cForm.title, description: cForm.description, coverUrl: cForm.coverUrl || undefined }); setEditCourse(false); flash("Curso actualizado ✔"); load(); }
    catch (e: any) { flash(e.message, false); }
  };
  const delCourse = async () => {
    if (!confirm("¿Borrar el curso y todas sus lecciones?")) return;
    try { await api(`/courses/${id}`, "DELETE"); window.location.href = d.community ? `/c/${d.community.slug}` : "/"; }
    catch (e: any) { flash(e.message, false); }
  };

  return (
    <div className="container">
      <TopBar
        backHref={d.community ? `/c/${d.community.slug}` : "/"}
        backLabel={d.community ? d.community.name : "Volver"}
        title={d.course.title}
      />

      <div style={{ marginTop: 12 }}>
        {d.course.coverUrl && <img src={d.course.coverUrl} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, marginBottom: 12 }} />}
        <h1>{d.course.title}</h1>
        {d.course.description && <p className="muted" style={{ marginTop: 4 }}>{d.course.description}</p>}
        <div style={{ marginTop: 12, background: "var(--chip)", borderRadius: 999, height: 10, overflow: "hidden" }}>
          <div style={{ width: `${d.progressPct}%`, height: "100%", background: "linear-gradient(90deg,var(--accent),var(--accent2))" }} />
        </div>
        <div className="muted" style={{ marginTop: 4 }}>{d.progressPct}% completado · {d.lessons.length} lecciones</div>
      </div>

      {msg && <div className={`toast ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      {d.isManager && (
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ghost" style={{ marginTop: 0 }} onClick={() => setShowAdd((s) => !s)}>{showAdd ? "Cancelar" : "+ Agregar lección"}</button>
          <button className="ghost" style={{ marginTop: 0 }} onClick={() => setEditCourse((s) => !s)}>✏️ Editar curso</button>
          <button className="ghost" style={{ marginTop: 0, color: "#ffb4c4" }} onClick={delCourse}>🗑 Borrar curso</button>
        </div>
      )}

      {editCourse && d.isManager && (
        <div className="card" style={{ marginTop: 10 }}>
          <label>Título</label>
          <input value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} />
          <label>Descripción</label>
          <textarea rows={2} value={cForm.description} onChange={(e) => setCForm({ ...cForm, description: e.target.value })} />
          <label>Portada (imagen)</label>
          <FilePicker
            label="Subir portada"
            hint="Horizontal (16:9) se ve mejor"
            value={cForm.coverUrl || undefined}
            busy={busy}
            onPick={(f) => onPickImage(f, (url) => setCForm({ ...cForm, coverUrl: url }))}
            onClear={() => setCForm({ ...cForm, coverUrl: "" })}
          />
          <div><button onClick={saveCourse} disabled={busy}>Guardar curso</button></div>
        </div>
      )}

      {showAdd && d.isManager && (
        <div className="card" style={{ marginTop: 10 }}>
          <label>Módulo (sección)</label>
          <input value={form.moduleName} onChange={(e) => setForm({ ...form, moduleName: e.target.value })} placeholder="Ej: Introducción" />
          <label>Título de la lección</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label>URL del video (YouTube no listado / Vimeo / .mp4)</label>
          <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://youtu.be/XXXXXXXXXXX" />
          <label>Contenido / notas (opcional)</label>
          <textarea rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <label>Desbloquear en nivel</label>
          <input value={form.minLevel} onChange={(e) => setForm({ ...form, minLevel: e.target.value })} style={{ width: 80 }} />
          <div><button onClick={addLesson} disabled={!form.title}>Guardar lección</button></div>
        </div>
      )}

      {!d.isMember && !d.isManager ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="muted">🔒 Debes ser <b>miembro activo</b> de la comunidad para ver las lecciones. Únete y realiza el pago para acceder.</div>
          {d.community && <a href={`/c/${d.community.slug}`}><button style={{ marginTop: 12 }}>Ir a la comunidad</button></a>}
        </div>
      ) : (
      <div className="course-grid" style={{ marginTop: 16 }}>
        <div className="card" style={{ alignSelf: "start" }}>
          {d.lessons.length === 0 && <div className="muted">Este curso aún no tiene lecciones.</div>}
          {modules.map((mod) => (
            <div key={mod.name} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: ".5px", margin: "6px 0" }}>{mod.name}</div>
              {mod.items.map((l) => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: l.locked ? "not-allowed" : "pointer", background: sel === l.id ? "var(--surface2)" : "transparent", opacity: l.locked ? 0.5 : 1, fontSize: 14 }}>
                  <span onClick={() => !l.locked && setSel(l.id)} style={{ flex: 1 }}>{l.completed ? "✅ " : l.locked ? "🔒 " : "▶️ "}{l.title}</span>
                  {d.isManager && (
                    <span style={{ display: "flex", gap: 4, fontSize: 12 }}>
                      <span onClick={() => move(l.id, "up")} title="Subir" style={{ cursor: "pointer" }}>↑</span>
                      <span onClick={() => move(l.id, "down")} title="Bajar" style={{ cursor: "pointer" }}>↓</span>
                      <span onClick={() => delLesson(l.id)} title="Borrar" style={{ cursor: "pointer" }}>🗑</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="card">
          {!current && <div className="muted">Selecciona una lección.</div>}
          {current && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>{current.title}</h2>
                {d.isManager && <button className="ghost" style={{ marginTop: 0 }} onClick={() => (editing === current.id ? setEditing(null) : startEdit(current))}>{editing === current.id ? "Cerrar" : "✏️ Editar"}</button>}
              </div>

              {editing === current.id && d.isManager ? (
                <div style={{ marginTop: 10 }}>
                  <label>Módulo</label><input value={editForm.moduleName} onChange={(e) => setEditForm({ ...editForm, moduleName: e.target.value })} />
                  <label>Título</label><input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                  <label>URL del video</label><input value={editForm.videoUrl} onChange={(e) => setEditForm({ ...editForm, videoUrl: e.target.value })} />
                  <label>Contenido</label><textarea rows={3} value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} />
                  <label>Nivel</label><input value={editForm.minLevel} onChange={(e) => setEditForm({ ...editForm, minLevel: e.target.value })} style={{ width: 80 }} />
                  <div><button onClick={() => saveEdit(current.id)}>Guardar cambios</button></div>
                </div>
              ) : current.locked ? (
                <div className="muted" style={{ marginTop: 10 }}>🔒 Se desbloquea en el nivel {current.minLevel} (tienes nivel {d.myLevel}).</div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {video?.kind === "youtube" || video?.kind === "vimeo" ? (
                    <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden" }}>
                      <iframe src={video.embedUrl} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={current.title} />
                    </div>
                  ) : video?.kind === "file" ? (
                    <video src={video.src} controls style={{ width: "100%", borderRadius: 10 }} />
                  ) : video?.kind === "link" ? (
                    <a href={video.href} target="_blank" rel="noreferrer"><button className="ghost">Abrir recurso ↗</button></a>
                  ) : <div className="muted">Esta lección no tiene video.</div>}
                  {current.content && <p style={{ marginTop: 14, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{current.content}</p>}
                  {d.isMember && <button onClick={() => complete(current.id)} disabled={current.completed} style={{ background: current.completed ? "var(--surface2)" : undefined }}>{current.completed ? "✅ Completada" : "Marcar como completada"}</button>}
                </div>
              )}

              {/* Navegación entre lecciones */}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <button className="ghost" style={{ marginTop: 0, visibility: prevLesson ? "visible" : "hidden" }} onClick={() => goto(prevLesson?.id)}>← Anterior</button>
                <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>{idx + 1} / {d.lessons.length}</span>
                <button className="ghost" style={{ marginTop: 0, visibility: nextLesson ? "visible" : "hidden" }} onClick={() => goto(nextLesson?.id)}>Siguiente →</button>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
