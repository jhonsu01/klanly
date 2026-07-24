"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, money, uploadFile } from "@/lib/api-client";

type Membership = { role: string; status: string; level: number; points: number } | null;
type Community = {
  id: string; slug: string; name: string; description?: string; iconUrl?: string | null;
  priceCents: number; currency: string; billingPeriod: string; isPublic?: boolean;
  memberCount: number; myMembership: Membership;
};
type Post = { id: string; title?: string; body?: string; likeCount: number; authorName: string };
type Course = { id: string; title: string; description?: string; minLevel: number };
type Member = { userId: string; role: string; level: number; points: number; displayName: string; handle: string };
type Pending = { id: string; amountCents: number; currency: string; proofUrl?: string; userEmail: string };
type LbEntry = { userId: string; points: number; level?: number; displayName: string; handle: string };
type Ev = { id: string; title: string; description?: string; startsAt: string; linkUrl?: string; kind: string };
type Msg = { id: string; body: string; authorName: string; createdAt: string };
type Noti = { id: string; body: string; type: string; read: boolean; createdAt: string };

type Tab = "community" | "classroom" | "calendar" | "leaderboard" | "members" | "chat" | "about" | "settings" | "review";

export default function CommunityPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const [c, setC] = useState<Community | null>(null);
  const [tab, setTab] = useState<Tab>("community");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [lb, setLb] = useState<LbEntry[]>([]);
  const [lbRange, setLbRange] = useState<"7d" | "30d" | "all">("all");
  const [evs, setEvs] = useState<Ev[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notis, setNotis] = useState<{ unread: number; items: Noti[] }>({ unread: 0, items: [] });
  const [showNotis, setShowNotis] = useState(false);

  const [postBody, setPostBody] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [chatText, setChatText] = useState("");
  const [evForm, setEvForm] = useState({ title: "", startsAt: "", linkUrl: "" });
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ name: "", description: "", priceUsd: "0", iconUrl: "", isPublic: true });
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, { id: string; body: string; authorName: string }[]>>({});
  const [commentText, setCommentText] = useState("");

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const com: Community = await api(`/communities/${slug}`);
      setC(com);
      setSettings({ name: com.name, description: com.description || "", priceUsd: (com.priceCents / 100).toString(), iconUrl: com.iconUrl || "", isPublic: com.isPublic ?? true });
      const [p, cs, ms] = await Promise.all([
        api(`/communities/${slug}/posts`).catch(() => []),
        api(`/communities/${slug}/courses`).catch(() => []),
        api(`/communities/${slug}/members`).catch(() => []),
      ]);
      setPosts(p); setCourses(cs); setMembers(ms);
      api(`/notifications`).then(setNotis).catch(() => {});
      const isManager = com.myMembership && (com.myMembership.role === "owner" || com.myMembership.role === "admin");
      if (isManager) setPending(await api(`/admin/payments/pending`).catch(() => []));
    } catch (e: any) { flash(e.message, false); }
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  // Cargar datos por pestaña
  useEffect(() => {
    if (!c) return;
    if (tab === "leaderboard") api(`/communities/${slug}/leaderboard?range=${lbRange}`).then((d) => setLb(d.entries)).catch(() => {});
    if (tab === "calendar") api(`/communities/${slug}/events`).then(setEvs).catch(() => {});
    if (tab === "chat") api(`/communities/${slug}/messages`).then(setMessages).catch(() => {});
  }, [tab, lbRange, c, slug]);

  // Polling del chat
  const chatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (tab === "chat" && c) {
      chatRef.current = setInterval(() => {
        api(`/communities/${slug}/messages`).then(setMessages).catch(() => {});
      }, 4000);
      return () => { if (chatRef.current) clearInterval(chatRef.current); };
    }
  }, [tab, c, slug]);

  if (!c) return <div className="container"><a href="/">← Volver</a><p className="muted" style={{ marginTop: 20 }}>Cargando…</p></div>;

  const isMember = c.myMembership && c.myMembership.status === "active";
  const isPending = c.myMembership && c.myMembership.status === "pending";
  const isOwner = c.myMembership?.role === "owner";
  const isManager = isOwner || c.myMembership?.role === "admin";
  const isFree = c.priceCents === 0 || c.billingPeriod === "free";

  const join = async () => {
    try {
      const r = await api(`/communities/${c.slug}/join`, "POST");
      flash(r.requiresPayment ? "Te uniste (pendiente de pago). Sube tu comprobante abajo." : "¡Te uniste! ✔");
      load();
    } catch (e: any) { flash(e.message, false); }
  };
  const payManual = async () => {
    try { await api(`/payments/orders/manual`, "POST", { communityId: c.id, proofUrl }); setProofUrl(""); flash("Comprobante enviado. En revisión ✔"); load(); }
    catch (e: any) { flash(e.message, false); }
  };
  const uploadProof = async (file?: File) => {
    if (!file) return;
    try { setBusy(true); const url = await uploadFile(file, "proofs"); setProofUrl(url); flash("Comprobante subido ✔"); }
    catch (e: any) { flash(e.message, false); } finally { setBusy(false); }
  };
  const uploadIcon = async (file?: File) => {
    if (!file) return;
    try { setBusy(true); const url = await uploadFile(file, "covers"); setSettings((s) => ({ ...s, iconUrl: url })); flash("Ícono subido ✔"); }
    catch (e: any) { flash(e.message, false); } finally { setBusy(false); }
  };
  const saveSettings = async () => {
    try {
      await api(`/communities/${c.slug}`, "PATCH", {
        name: settings.name, description: settings.description,
        priceCents: Math.round(parseFloat(settings.priceUsd || "0") * 100),
        iconUrl: settings.iconUrl || undefined, isPublic: settings.isPublic,
      });
      flash("Comunidad actualizada ✔"); load();
    } catch (e: any) { flash(e.message, false); }
  };
  const toggleComments = async (postId: string) => {
    if (openPost === postId) { setOpenPost(null); return; }
    setOpenPost(postId);
    try { const cs = await api(`/posts/${postId}/comments`); setComments((m) => ({ ...m, [postId]: cs })); } catch {}
  };
  const addComment = async (postId: string) => {
    try { await api(`/posts/${postId}/comments`, "POST", { body: commentText }); setCommentText(""); const cs = await api(`/posts/${postId}/comments`); setComments((m) => ({ ...m, [postId]: cs })); }
    catch (e: any) { flash(e.message, false); }
  };
  const publish = async () => { try { await api(`/communities/${c.slug}/posts`, "POST", { body: postBody }); setPostBody(""); flash("Publicado ✔"); load(); } catch (e: any) { flash(e.message, false); } };
  const like = async (id: string) => { try { await api(`/posts/${id}/like`, "POST"); load(); } catch (e: any) { flash(e.message, false); } };
  const createCourse = async () => { try { await api(`/communities/${c.slug}/courses`, "POST", { title: courseTitle }); setCourseTitle(""); flash("Curso creado ✔"); load(); } catch (e: any) { flash(e.message, false); } };
  const review = async (id: string, decision: "approve" | "reject") => { try { await api(`/payments/orders/${id}/review`, "POST", { decision }); flash(decision === "approve" ? "Aprobado ✔" : "Rechazado"); load(); } catch (e: any) { flash(e.message, false); } };
  const changeRole = async (userId: string, role: string) => { try { await api(`/communities/${c.slug}/members/${userId}`, "PATCH", { role }); flash("Rol actualizado ✔"); load(); } catch (e: any) { flash(e.message, false); } };
  const sendMsg = async () => { try { await api(`/communities/${c.slug}/messages`, "POST", { body: chatText }); setChatText(""); const d = await api(`/communities/${c.slug}/messages`); setMessages(d); } catch (e: any) { flash(e.message, false); } };
  const createEvent = async () => {
    try {
      await api(`/communities/${c.slug}/events`, "POST", {
        title: evForm.title,
        startsAt: new Date(evForm.startsAt).toISOString(),
        linkUrl: evForm.linkUrl || undefined,
        kind: evForm.linkUrl ? "link" : "meet",
      });
      setEvForm({ title: "", startsAt: "", linkUrl: "" }); flash("Evento creado ✔");
      setEvs(await api(`/communities/${slug}/events`));
    } catch (e: any) { flash(e.message, false); }
  };
  const openNotis = async () => { setShowNotis((s) => !s); if (!showNotis && notis.unread > 0) { await api(`/notifications/read`, "POST").catch(() => {}); setNotis((n) => ({ ...n, unread: 0 })); } };

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button className={tab === id ? "" : "ghost"} style={{ marginTop: 0 }} onClick={() => setTab(id)}>{label}</button>
  );

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/" className="muted">← Todas las comunidades</a>
        <button className="ghost" style={{ marginTop: 0 }} onClick={openNotis}>🔔 {notis.unread > 0 ? notis.unread : ""}</button>
      </div>
      {showNotis && (
        <div className="card" style={{ marginTop: 8 }}>
          <h2>Notificaciones</h2>
          {notis.items.length === 0 && <div className="muted">Sin notificaciones.</div>}
          {notis.items.map((n) => <div className="row" key={n.id}><div>{n.body}</div></div>)}
        </div>
      )}

      <div className="brand" style={{ marginTop: 12 }}>
        <div className="logo">{c.name.charAt(0).toUpperCase()}</div>
        <div>
          <h1>{c.name}</h1>
          <div className="muted">{isFree ? "Free" : `${money(c.priceCents, c.currency)}/${c.billingPeriod}`} · {c.memberCount} miembros · /{c.slug}</div>
        </div>
      </div>
      {c.description && <p className="muted" style={{ marginTop: 8 }}>{c.description}</p>}
      {msg && <div className={`out ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      {!c.myMembership && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Unirte</h2>
          <div className="muted">{isFree ? "Comunidad gratuita." : `Membresía ${money(c.priceCents, c.currency)}/${c.billingPeriod}.`}</div>
          <button onClick={join}>{isFree ? "Unirme gratis" : "Unirme"}</button>
        </div>
      )}
      {isPending && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Pago manual (comprobante)</h2>
          <div className="muted">Transfiere {money(c.priceCents, c.currency)} y sube la foto/captura de tu comprobante. El productor lo revisará.</div>
          <label>Comprobante (imagen)</label>
          <input type="file" accept="image/*" onChange={(e) => uploadProof(e.target.files?.[0])} />
          {proofUrl && <img src={proofUrl} alt="comprobante" style={{ maxWidth: 220, borderRadius: 8, marginTop: 8, display: "block" }} />}
          <button onClick={payManual} disabled={!proofUrl || busy}>{busy ? "Subiendo…" : "Enviar comprobante"}</button>
        </div>
      )}
      {isMember && c.myMembership && (
        <div className="card" style={{ marginTop: 16 }}>
          <div>Tu estado: <span className="pill">{c.myMembership.role}</span> · Nivel {c.myMembership.level} · {c.myMembership.points} pts</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, margin: "20px 0 12px", flexWrap: "wrap" }}>
        <TabBtn id="community" label="Community" />
        <TabBtn id="classroom" label="Classroom" />
        <TabBtn id="calendar" label="Calendar" />
        <TabBtn id="leaderboard" label="Leaderboards" />
        <TabBtn id="members" label={`Members (${members.length})`} />
        <TabBtn id="about" label="About" />
        {isMember && <TabBtn id="chat" label="Chat" />}
        {isManager && <TabBtn id="review" label={`Comprobantes (${pending.length})`} />}
        {isOwner && <TabBtn id="settings" label="Ajustes" />}
      </div>

      {tab === "community" && (
        <div className="card">
          {isMember ? (<>
            <textarea value={postBody} onChange={(e) => setPostBody(e.target.value)} rows={2} placeholder="Escribe algo…" />
            <button onClick={publish} disabled={!postBody}>Publicar</button>
          </>) : <div className="muted">Únete para publicar.</div>}
          <div style={{ marginTop: 16 }}>
            {posts.length === 0 && <div className="muted">Aún no hay publicaciones.</div>}
            {posts.map((p) => (
              <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "12px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>{p.title && <div style={{ fontWeight: 600 }}>{p.title}</div>}<div>{p.body}</div><div className="muted">{p.authorName}</div></div>
                  <button className="ghost" style={{ marginTop: 0 }} onClick={() => like(p.id)}>👍 {p.likeCount}</button>
                </div>
                {isMember && <button className="ghost" style={{ marginTop: 8, fontSize: 12, padding: "4px 10px" }} onClick={() => toggleComments(p.id)}>💬 Comentarios</button>}
                {openPost === p.id && (
                  <div style={{ marginTop: 8, paddingLeft: 12 }}>
                    {(comments[p.id] || []).map((cm) => <div key={cm.id} style={{ fontSize: 13, padding: "3px 0" }}><b>{cm.authorName}:</b> {cm.body}</div>)}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Comenta…" onKeyDown={(e) => e.key === "Enter" && commentText && addComment(p.id)} />
                      <button style={{ marginTop: 0 }} onClick={() => addComment(p.id)} disabled={!commentText}>Enviar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "classroom" && (
        <div className="card">
          {isManager && (<>
            <label>Nuevo curso</label>
            <input value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Título del curso" />
            <button onClick={createCourse} disabled={!courseTitle}>Crear curso</button>
          </>)}
          <div style={{ marginTop: 16 }}>
            {courses.length === 0 && <div className="muted">Aún no hay cursos.</div>}
            {courses.map((co) => (
              <div className="row" key={co.id}>
                <div>
                  <a href={`/course/${co.id}`} style={{ fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>{co.title}</a>
                  {co.description && <div className="muted">{co.description}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="pill">Nivel {co.minLevel}+</span>
                  <a href={`/course/${co.id}`}><button className="ghost" style={{ marginTop: 0 }}>Abrir →</button></a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "calendar" && (
        <div className="card">
          {isManager && (<>
            <label>Nuevo evento</label>
            <input value={evForm.title} onChange={(e) => setEvForm({ ...evForm, title: e.target.value })} placeholder="Título" />
            <label>Fecha y hora</label>
            <input type="datetime-local" value={evForm.startsAt} onChange={(e) => setEvForm({ ...evForm, startsAt: e.target.value })} />
            <label>Enlace (Meet/Zoom, opcional)</label>
            <input value={evForm.linkUrl} onChange={(e) => setEvForm({ ...evForm, linkUrl: e.target.value })} placeholder="https://meet…" />
            <button onClick={createEvent} disabled={!evForm.title || !evForm.startsAt}>Crear evento</button>
          </>)}
          <div style={{ marginTop: 16 }}>
            {evs.length === 0 && <div className="muted">No hay eventos próximos.</div>}
            {evs.map((e) => (
              <div className="row" key={e.id}>
                <div><div style={{ fontWeight: 600 }}>{e.title}</div><div className="muted">{new Date(e.startsAt).toLocaleString()}</div></div>
                {e.linkUrl && <a href={e.linkUrl} target="_blank" rel="noreferrer"><button className="ghost" style={{ marginTop: 0 }}>Unirse</button></a>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="card">
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["7d", "30d", "all"] as const).map((r) => (
              <button key={r} className={lbRange === r ? "" : "ghost"} style={{ marginTop: 0 }} onClick={() => setLbRange(r)}>
                {r === "7d" ? "7 días" : r === "30d" ? "30 días" : "Todo"}
              </button>
            ))}
          </div>
          {lb.length === 0 && <div className="muted">Sin actividad en este período.</div>}
          {lb.map((e, i) => (
            <div className="row" key={e.userId}>
              <div><b style={{ color: "var(--gold)" }}>#{i + 1}</b> &nbsp;{e.displayName} <span className="muted">@{e.handle}</span></div>
              <div className="pill">{e.points} pts{e.level ? ` · Nv ${e.level}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "members" && (
        <div className="card">
          {members.map((m) => (
            <div className="row" key={m.userId}>
              <div><a href={`/u/${m.handle}`} style={{ color: "var(--text)", textDecoration: "none" }}>{m.displayName}</a> <span className="muted">@{m.handle}</span> · <span className="pill">{m.role}</span> · Nv {m.level} · {m.points} pts</div>
              {isOwner && m.role !== "owner" && (
                <select value={m.role} onChange={(e) => changeRole(m.userId, e.target.value)} style={{ width: "auto", marginTop: 0 }}>
                  <option value="member">member</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "chat" && isMember && (
        <div className="card">
          <div style={{ maxHeight: 360, overflowY: "auto", marginBottom: 12 }}>
            {messages.length === 0 && <div className="muted">Sé el primero en escribir.</div>}
            {messages.map((m) => (
              <div key={m.id} style={{ padding: "6px 0" }}>
                <span style={{ fontWeight: 600 }}>{m.authorName}:</span> {m.body}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Mensaje…" onKeyDown={(e) => e.key === "Enter" && chatText && sendMsg()} />
            <button style={{ marginTop: 0 }} onClick={sendMsg} disabled={!chatText}>Enviar</button>
          </div>
        </div>
      )}

      {tab === "about" && (
        <div className="card">
          <h2>Acerca de</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{c.description || "Sin descripción."}</p>
          <div className="row"><div className="muted">Precio</div><div>{isFree ? "Free" : `${money(c.priceCents, c.currency)}/${c.billingPeriod}`}</div></div>
          <div className="row"><div className="muted">Miembros</div><div>{c.memberCount}</div></div>
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Admins</div>
            {members.filter((m) => m.role === "owner" || m.role === "admin").map((m) => (
              <div className="row" key={m.userId}><div><a href={`/u/${m.handle}`} style={{ color: "var(--text)", textDecoration: "none" }}>{m.displayName}</a> <span className="pill">{m.role}</span></div></div>
            ))}
          </div>
        </div>
      )}

      {tab === "settings" && isOwner && (
        <div className="card">
          <h2>Ajustes de la comunidad</h2>
          <label>Nombre</label>
          <input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
          <label>Descripción</label>
          <textarea rows={3} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
          <label>Precio mensual (USD, 0 = gratis)</label>
          <input value={settings.priceUsd} onChange={(e) => setSettings({ ...settings, priceUsd: e.target.value })} />
          <label>Ícono de la comunidad</label>
          <input type="file" accept="image/*" onChange={(e) => uploadIcon(e.target.files?.[0])} />
          {settings.iconUrl && <img src={settings.iconUrl} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", marginTop: 8, display: "block" }} />}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={settings.isPublic} onChange={(e) => setSettings({ ...settings, isPublic: e.target.checked })} />
            Pública (aparece en el descubrimiento)
          </label>
          <button onClick={saveSettings} disabled={busy}>Guardar cambios</button>
        </div>
      )}

      {tab === "review" && isManager && (
        <div className="card">
          <h2>Comprobantes por revisar</h2>
          {pending.length === 0 && <div className="muted">Nada pendiente.</div>}
          {pending.map((o) => (
            <div className="row" key={o.id}>
              <div><div>{o.userEmail} · {money(o.amountCents, o.currency)}</div>{o.proofUrl && <a href={o.proofUrl} target="_blank" rel="noreferrer">ver comprobante</a>}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ marginTop: 0, background: "var(--green)", color: "#04231a" }} onClick={() => review(o.id, "approve")}>Aprobar</button>
                <button className="ghost" style={{ marginTop: 0 }} onClick={() => review(o.id, "reject")}>Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
