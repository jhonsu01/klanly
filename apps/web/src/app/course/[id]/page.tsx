"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, uploadFile } from "@/lib/api-client";
import FilePicker from "@/components/FilePicker";
import TopBar from "@/components/TopBar";
import MarkdownEditor from "@/components/MarkdownEditor";
import ResourceEditor, { ResourceList, type Resource } from "@/components/Resources";
import ConfirmDanger from "@/components/ConfirmDanger";
import { renderMarkdown } from "@/lib/markdown";
import { parseVideo } from "@/lib/video";

type Lesson = {
  id: string; moduleName?: string | null; title: string; videoUrl?: string | null;
  content?: string | null; resources?: Resource[] | null;
  minLevel: number; position: number; completed: boolean; locked: boolean;
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
const noRes: Resource[] = [];

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
  const [formRes, setFormRes] = useState<Resource[]>(noRes);
  const [editRes, setEditRes] = useState<Resource[]>(noRes);
  const [confirm, setConfirm] = useState<null | { kind: "course" } | { kind: "lesson"; id: string; title: string }>(null);
  // Modulo expandido en el acordeon (null = todos recogidos)
  const [openModule, setOpenModule] = useState<string | null>(null);

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

  // Mantener abierto el modulo al que pertenece la leccion actual, tambien
  // cuando se navega con Anterior/Siguiente entre modulos distintos.
  useEffect(() => {
    if (!d || !sel) return;
    const l = d.lessons.find((x) => x.id === sel);
    if (l) setOpenModule(l.moduleName?.trim() || "General");
  }, [d, sel]);

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
        resources: formRes.filter((r) => r.url.trim()),
      });
      setForm({ ...empty }); setFormRes([]); setShowAdd(false); flash("Lección agregada ✔"); load();
    } catch (e: any) { flash(e.message, false); }
  };
  const complete = async (lessonId: string) => {
    try { const r = await api(`/lessons/${lessonId}/complete`, "POST"); flash(r.leveledUp ? `¡Completada! Nivel ${r.level} 🎉` : "Lección completada ✔"); load(); }
    catch (e: any) { flash(e.message, false); }
  };
  const startEdit = (l: Lesson) => {
    setEditing(l.id);
    setEditForm({ moduleName: l.moduleName || "", title: l.title, videoUrl: l.videoUrl || "", content: l.content || "", minLevel: String(l.minLevel) });
    setEditRes(l.resources ?? []);
  };
  const saveEdit = async (lessonId: string) => {
    try {
      await api(`/lessons/${lessonId}`, "PATCH", {
        title: editForm.title, moduleName: editForm.moduleName, videoUrl: editForm.videoUrl,
        content: editForm.content, minLevel: parseInt(editForm.minLevel || "1", 10),
        resources: editRes.filter((r) => r.url.trim()),
      });
      setEditing(null); flash("Lección actualizada ✔"); load();
    } catch (e: any) { flash(e.message, false); }
  };
  const delLesson = async (lessonId: string) => {
    try { await api(`/lessons/${lessonId}`, "DELETE"); if (sel === lessonId) setSel(null); setConfirm(null); flash("Lección borrada"); load(); }
    catch (e: any) { flash(e.message, false); }
  };
  const move = async (lessonId: string, dir: "up" | "down") => { try { await api(`/lessons/${lessonId}`, "PATCH", { move: dir }); load(); } catch (e: any) { flash(e.message, false); } };
  const saveCourse = async () => {
    try { await api(`/courses/${id}`, "PATCH", { title: cForm.title, description: cForm.description, coverUrl: cForm.coverUrl || undefined }); setEditCourse(false); flash("Curso actualizado ✔"); load(); }
    catch (e: any) { flash(e.message, false); }
  };
  const delCourse = async () => {
    try { await api(`/courses/${id}`, "DELETE"); window.location.href = d.community ? `/c/${d.community.slug}` : "/"; }
    catch (e: any) { setConfirm(null); flash(e.message, false); }
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
        <div className="meter" style={{ marginTop: 12 }}>
          <i style={{ width: `${d.progressPct}%` }}></i>
        </div>
        <div className="meta" style={{ marginTop: 6 }}>{d.progressPct}% completado · {d.lessons.length} lecciones</div>
      </div>

      {msg && <div className={`toast ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      {confirm?.kind === "course" && (
        <ConfirmDanger
          title="Borrar el curso completo"
          detail={`Vas a eliminar «${d.course.title}» de la comunidad.`}
          bullets={[
            `Se borrarán las ${d.lessons.length} lecciones del curso.`,
            "Se perderá el progreso de todos los miembros en este curso.",
            "Los videos y materiales enlazados dejarán de estar disponibles aquí.",
          ]}
          actionLabel="Borrar curso"
          onConfirm={delCourse}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "lesson" && (
        <ConfirmDanger
          title="Borrar la lección"
          detail={`Vas a eliminar «${confirm.title}».`}
          bullets={["Se perderá el progreso de los miembros en esta lección."]}
          actionLabel="Borrar lección"
          onConfirm={() => delLesson(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {d.isManager && (
        <div className="action-bar" style={{ marginTop: 14 }}>
          <button className="ghost" onClick={() => setShowAdd((s) => !s)}>{showAdd ? "Cancelar" : "+ Agregar lección"}</button>
          <button className="ghost" onClick={() => setEditCourse((s) => !s)}>✏️ Editar curso</button>
          <button className="danger" onClick={() => setConfirm({ kind: "course" })}>🗑 Borrar curso</button>
        </div>
      )}

      {editCourse && d.isManager && (
        <div className="card" style={{ marginTop: 12 }}>
          <label className="label">Título</label>
          <input value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} />
          <label className="label">Descripción</label>
          <textarea rows={2} value={cForm.description} onChange={(e) => setCForm({ ...cForm, description: e.target.value })} />
          <label className="label">Portada (imagen)</label>
          <FilePicker
            label="Subir portada"
            hint="Horizontal (16:9) se ve mejor"
            value={cForm.coverUrl || undefined}
            busy={busy}
            onPick={(f) => onPickImage(f, (url) => setCForm({ ...cForm, coverUrl: url }))}
            onClear={() => setCForm({ ...cForm, coverUrl: "" })}
          />
          <div style={{ marginTop: 8 }}><button onClick={saveCourse} disabled={busy}>Guardar curso</button></div>
        </div>
      )}

      {showAdd && d.isManager && (
        <div className="card" style={{ marginTop: 12 }}>
          <label className="label">Módulo (sección)</label>
          <input value={form.moduleName} onChange={(e) => setForm({ ...form, moduleName: e.target.value })} placeholder="Ej: Introducción" />
          <label className="label">Título de la lección</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label className="label">URL del video (YouTube no listado / Vimeo / .mp4)</label>
          <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://youtu.be/XXXXXXXXXXX" />
          <label className="label">Contenido / notas (opcional)</label>
          <MarkdownEditor value={form.content} onChange={(v) => setForm({ ...form, content: v })} />
          <label className="label">Material complementario (enlaces e imágenes externas)</label>
          <ResourceEditor items={formRes} onChange={setFormRes} />
          <label className="label">Desbloquear en nivel</label>
          <input value={form.minLevel} onChange={(e) => setForm({ ...form, minLevel: e.target.value })} style={{ width: 80 }} />
          <div style={{ marginTop: 8 }}><button onClick={addLesson} disabled={!form.title}>Guardar lección</button></div>
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
          {/* Acordeon: solo se expande el modulo de la leccion actual. Con
              muchos modulos, tenerlos todos abiertos obligaba a un scroll
              enorme para llegar al contenido. */}
          {modules.map((mod) => {
            const open = openModule === mod.name;
            const done = mod.items.filter((l) => l.completed).length;
            const hasCurrent = mod.items.some((l) => l.id === sel);
            return (
              <div key={mod.name} className={`mod${open ? " open" : ""}`}>
                <button className="mod-head" onClick={() => setOpenModule(open ? null : mod.name)}>
                  <span className="mod-chev" aria-hidden>{open ? "–" : "+"}</span>
                  <span className="mod-name">{mod.name}</span>
                  {hasCurrent && !open && <span className="pill brand">Aquí</span>}
                  <span className="mod-count">{done}/{mod.items.length}</span>
                </button>

                {open && (
                  <div className="mod-body">
                    {mod.items.map((l) => (
                      <div
                        key={l.id}
                        className={`les${sel === l.id ? " active" : ""}${l.locked ? " locked" : ""}`}
                        onClick={() => !l.locked && setSel(l.id)}
                      >
                        <span className="les-ico" aria-hidden>{l.completed ? "✅" : l.locked ? "🔒" : "▶️"}</span>
                        <span className="les-title">{l.title}</span>
                        {d.isManager && (
                          <span className="les-actions" onClick={(e) => e.stopPropagation()}>
                            <button className="icon-btn" onClick={() => move(l.id, "up")} title="Subir">↑</button>
                            <button className="icon-btn" onClick={() => move(l.id, "down")} title="Bajar">↓</button>
                            <button className="icon-btn" onClick={() => setConfirm({ kind: "lesson", id: l.id, title: l.title })} title="Borrar">🗑</button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="card">
          {!current && <div className="muted">Selecciona una lección.</div>}
          {current && (
            <>
              <div className="row">
                <h2>{current.title}</h2>
                {d.isManager && <button className="ghost" style={{ marginTop: 0 }} onClick={() => (editing === current.id ? setEditing(null) : startEdit(current))}>{editing === current.id ? "Cerrar" : "✏️ Editar"}</button>}
              </div>

              {editing === current.id && d.isManager ? (
                <div style={{ marginTop: 12 }}>
                  <label className="label">Módulo</label><input value={editForm.moduleName} onChange={(e) => setEditForm({ ...editForm, moduleName: e.target.value })} />
                  <label className="label">Título</label><input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                  <label className="label">URL del video</label><input value={editForm.videoUrl} onChange={(e) => setEditForm({ ...editForm, videoUrl: e.target.value })} />
                  <label className="label">Contenido</label>
                  <MarkdownEditor value={editForm.content} onChange={(v) => setEditForm({ ...editForm, content: v })} />
                  <label className="label">Material complementario (enlaces e imágenes externas)</label>
                  <ResourceEditor items={editRes} onChange={setEditRes} />
                  <label className="label">Nivel</label><input value={editForm.minLevel} onChange={(e) => setEditForm({ ...editForm, minLevel: e.target.value })} style={{ width: 80 }} />
                  <div style={{ marginTop: 8 }}><button onClick={() => saveEdit(current.id)}>Guardar cambios</button></div>
                </div>
              ) : current.locked ? (
                <div className="muted" style={{ marginTop: 12 }}>🔒 Se desbloquea en el nivel {current.minLevel} (tienes nivel {d.myLevel}).</div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {video?.kind === "youtube" || video?.kind === "vimeo" ? (
                    <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden", background: "var(--surface2)" }}>
                      <iframe src={video.embedUrl} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={current.title} />
                    </div>
                  ) : video?.kind === "file" ? (
                    <video src={video.src} controls style={{ width: "100%", borderRadius: 10, background: "var(--surface2)" }} />
                  ) : video?.kind === "link" ? (
                    <a href={video.href} target="_blank" rel="noreferrer"><button className="ghost">Abrir recurso ↗</button></a>
                  ) : <div className="muted">Esta lección no tiene video.</div>}
                  {current.content && (
                    <div className="md-body" style={{ marginTop: 14 }}
                         dangerouslySetInnerHTML={{ __html: renderMarkdown(current.content) }} />
                  )}
                  <ResourceList items={current.resources} />
                  {d.isMember && <button onClick={() => complete(current.id)} disabled={current.completed} className={current.completed ? "out" : ""} style={{ marginTop: 16 }}>{current.completed ? "✅ Completada" : "Marcar como completada"}</button>}
                </div>
              )}

              <div className="row" style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
                <button className="ghost" style={{ visibility: prevLesson ? "visible" : "hidden" }} onClick={() => goto(prevLesson?.id)}>← Anterior</button>
                <span className="meta" style={{ alignSelf: "center" }}>{idx + 1} / {d.lessons.length}</span>
                <button className="ghost" style={{ visibility: nextLesson ? "visible" : "hidden" }} onClick={() => goto(nextLesson?.id)}>Siguiente →</button>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
