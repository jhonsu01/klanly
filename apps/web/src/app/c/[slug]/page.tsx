"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, money, uploadFile, askStepUp } from "@/lib/api-client";
import FilePicker from "@/components/FilePicker";
import { getPusherClient, realtimeEnabled } from "@/lib/pusher-client";

type Membership = { role: string; status: string; level: number; points: number; accessUntil?: string | null } | null;
type Community = {
  id: string; slug: string; name: string; description?: string; iconUrl?: string | null;
  priceCents: number; currency: string; billingPeriod: string; isPublic?: boolean;
  affiliateEnabled?: boolean; affiliateCommissionPct?: number; payoutTermsDays?: number;
  manualEnabled?: boolean; manualAccounts?: { bank: string; number: string; name: string }[];
  memberCount: number; myMembership: Membership; myOrderStatus?: string | null;
};
type Account = { bank: string; number: string; name: string };
type Applicant = { userId: string; code: string; status: string; displayName: string; handle: string };
type AffPayout = { id: string; amountCents: number; currency: string; method?: string; status: string; payeeName: string };
type Post = { id: string; title?: string; body?: string; category?: string; pinned?: boolean; likeCount: number; authorName: string; authorHandle?: string };
type Course = { id: string; title: string; description?: string; minLevel: number };
type Member = { userId: string; role: string; level: number; points: number; displayName: string; handle: string };
type Pending = { id: string; amountCents: number; currency: string; proofUrl?: string; userEmail: string };
type LbEntry = { userId: string; points: number; level?: number; displayName: string; handle: string };
type Ev = { id: string; title: string; description?: string; startsAt: string; linkUrl?: string; kind: string };
type Msg = { id: string; body: string; authorName: string; createdAt: string };
type Noti = { id: string; body: string; type: string; read: boolean; createdAt: string };

type Tab = "community" | "classroom" | "calendar" | "leaderboard" | "members" | "chat" | "about" | "affiliates" | "income" | "settings" | "review";
type Income = {
  currency: string; revenueCents: number; paidCount: number; activeMembers: number;
  commissionsOwedCents: number; commissionsPaidCents: number; pendingPayoutsCents: number;
  recent: { amountCents: number; currency: string; method: string; paidAt?: string; userEmail: string }[];
};

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
  const [postTitle, setPostTitle] = useState("");
  const [postCategory, setPostCategory] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [chatText, setChatText] = useState("");
  const [evForm, setEvForm] = useState({ title: "", startsAt: "", linkUrl: "" });
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ name: "", description: "", priceUsd: "0", currency: "USD", iconUrl: "", isPublic: true, affiliateEnabled: false, commissionPct: "0", payoutTermsDays: 30 });
  const [manualEnabled, setManualEnabled] = useState(true);
  const [manualAccounts, setManualAccounts] = useState<Account[]>([]);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, { id: string; body: string; authorName: string }[]>>({});
  const [commentText, setCommentText] = useState("");
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [affPayouts, setAffPayouts] = useState<AffPayout[]>([]);
  const [myAff, setMyAff] = useState<{ code: string; status: string } | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [income, setIncome] = useState<Income | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const com: Community = await api(`/communities/${slug}`);
      setC(com);
      setSettings({
        name: com.name, description: com.description || "", priceUsd: (com.priceCents / 100).toString(),
        currency: com.currency || "USD",
        iconUrl: com.iconUrl || "", isPublic: com.isPublic ?? true,
        affiliateEnabled: com.affiliateEnabled ?? false, commissionPct: String(com.affiliateCommissionPct ?? 0),
        payoutTermsDays: com.payoutTermsDays ?? 30,
      });
      setManualEnabled(com.manualEnabled ?? true);
      setManualAccounts(com.manualAccounts ?? []);
      const [p, cs, ms] = await Promise.all([
        api(`/communities/${slug}/posts`).catch(() => []),
        api(`/communities/${slug}/courses`).catch(() => []),
        api(`/communities/${slug}/members`).catch(() => []),
      ]);
      setPosts(p); setCourses(cs); setMembers(ms);
      api(`/notifications`).then(setNotis).catch(() => {});
      api(`/auth/me`).then((m) => setMeId(m.id)).catch(() => {});
      // Mi cuenta de afiliado en esta comunidad
      if (com.myMembership) {
        api(`/affiliates/me`).then((d) => {
          const acc = (d.accounts || []).find((a: any) => a.communityId === com.id);
          setMyAff(acc ? { code: acc.code, status: acc.status } : null);
        }).catch(() => {});
      }
      const isManager = com.myMembership && (com.myMembership.role === "owner" || com.myMembership.role === "admin");
      if (isManager) {
        setPending(await api(`/admin/payments/pending`).catch(() => []));
        api(`/communities/${slug}/affiliates`).then(setApplicants).catch(() => {});
        api(`/communities/${slug}/payouts`).then(setAffPayouts).catch(() => {});
      }
    } catch (e: any) { flash(e.message, false); }
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  // Capturar ?ref= del link de afiliado
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r) setRefCode(r);
  }, []);

  // Cargar datos por pestaña
  useEffect(() => {
    if (!c) return;
    if (tab === "leaderboard") api(`/communities/${slug}/leaderboard?range=${lbRange}`).then((d) => setLb(d.entries)).catch(() => {});
    if (tab === "calendar") api(`/communities/${slug}/events`).then(setEvs).catch(() => {});
    if (tab === "chat") api(`/communities/${slug}/messages`).then(setMessages).catch(() => {});
    if (tab === "income") api(`/communities/${slug}/income`).then(setIncome).catch(() => {});
  }, [tab, lbRange, c, slug]);

  // Polling del chat
  const chatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // Fallback por polling solo si NO hay realtime configurado
    if (tab === "chat" && c && !realtimeEnabled()) {
      chatRef.current = setInterval(() => {
        api(`/communities/${slug}/messages`).then(setMessages).catch(() => {});
      }, 4000);
      return () => { if (chatRef.current) clearInterval(chatRef.current); };
    }
  }, [tab, c, slug]);

  // Realtime (Pusher): chat en vivo + campana de notificaciones
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher || !c) return;
    const comCh = pusher.subscribe(`community-${c.id}`);
    comCh.bind("message", () => { api(`/communities/${slug}/messages`).then(setMessages).catch(() => {}); });
    let userCh: ReturnType<typeof pusher.subscribe> | null = null;
    if (meId) {
      userCh = pusher.subscribe(`user-${meId}`);
      userCh.bind("notification", () => { api(`/notifications`).then(setNotis).catch(() => {}); });
    }
    return () => {
      comCh.unbind_all(); pusher.unsubscribe(`community-${c.id}`);
      if (meId) { userCh?.unbind_all(); pusher.unsubscribe(`user-${meId}`); }
    };
  }, [c, meId, slug]);

  if (!c) return <div className="container"><a href="/">← Volver</a><p className="muted" style={{ marginTop: 20 }}>Cargando…</p></div>;

  const isMember = c.myMembership && c.myMembership.status === "active";
  const isPastDue = c.myMembership && c.myMembership.status === "past_due";
  const isPending = c.myMembership && (c.myMembership.status === "pending" || c.myMembership.status === "past_due");
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
    try { await api(`/payments/orders/manual`, "POST", { communityId: c.id, proofUrl, referralCode: refCode || undefined }); setProofUrl(""); flash("Comprobante enviado. En revisión ✔"); load(); }
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
      const cleanAccounts = manualAccounts.filter((a) => a.bank || a.number || a.name);
      // Las cuentas de pago son sensibles: solo se envían (y piden confirmación) si cambiaron.
      const accountsChanged = JSON.stringify(cleanAccounts) !== JSON.stringify(c.manualAccounts ?? []);
      let code: string | null = null;
      if (accountsChanged) {
        code = await askStepUp("el cambio de tus cuentas de pago");
        if (!code) return;
      }
      await api(`/communities/${c.slug}`, "PATCH", {
        name: settings.name, description: settings.description,
        priceCents: Math.round(parseFloat(settings.priceUsd || "0") * 100),
        currency: settings.currency,
        iconUrl: settings.iconUrl || undefined, isPublic: settings.isPublic,
        affiliateEnabled: settings.affiliateEnabled,
        affiliateCommissionPct: parseFloat(settings.commissionPct || "0"),
        payoutTermsDays: settings.payoutTermsDays,
        manualEnabled,
        ...(accountsChanged ? { manualAccounts: cleanAccounts, code } : {}),
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
  const applyAffiliate = async () => {
    try { const r = await api(`/communities/${c.slug}/affiliates`, "POST"); setMyAff({ code: r.code, status: r.status }); flash(r.status === "approved" ? "Ya eres afiliado ✔" : "Solicitud enviada. El productor debe aprobarte."); }
    catch (e: any) { flash(e.message, false); }
  };
  const reviewApplicant = async (userId: string, decision: "approve" | "reject") => {
    try { await api(`/communities/${c.slug}/affiliates/${userId}`, "PATCH", { decision }); flash(decision === "approve" ? "Afiliado aprobado ✔" : "Rechazado"); setApplicants(await api(`/communities/${slug}/affiliates`)); }
    catch (e: any) { flash(e.message, false); }
  };
  const reviewPayout = async (id: string, decision: "approve" | "reject") => {
    try { await api(`/payouts/${id}`, "PATCH", { decision }); flash(decision === "approve" ? "Payout autorizado y pagado ✔" : "Payout rechazado"); setAffPayouts(await api(`/communities/${slug}/payouts`)); }
    catch (e: any) { flash(e.message, false); }
  };
  const affiliateLink = myAff ? `${typeof window !== "undefined" ? window.location.origin : ""}/c/${c.slug}?ref=${myAff.code}` : "";
  const publish = async () => { try { await api(`/communities/${c.slug}/posts`, "POST", { body: postBody, title: postTitle || undefined, category: postCategory || undefined }); setPostBody(""); setPostTitle(""); setPostCategory(""); flash("Publicado ✔"); load(); } catch (e: any) { flash(e.message, false); } };
  const like = async (id: string) => { try { await api(`/posts/${id}/like`, "POST"); load(); } catch (e: any) { flash(e.message, false); } };
  const pinPost = async (id: string, pinned: boolean) => { try { await api(`/posts/${id}`, "PATCH", { pinned }); flash(pinned ? "Fijado ✔" : "Desfijado"); load(); } catch (e: any) { flash(e.message, false); } };
  const delPost = async (id: string) => { if (!confirm("¿Borrar esta publicación?")) return; try { await api(`/posts/${id}`, "DELETE"); flash("Borrado"); load(); } catch (e: any) { flash(e.message, false); } };
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
          <h2>{isPastDue ? "Renovar acceso (comprobante)" : "Pago manual (comprobante)"}</h2>
          {isPastDue && <div className="err" style={{ marginBottom: 6 }}>Tu acceso venció{c.myMembership?.accessUntil ? ` el ${new Date(c.myMembership.accessUntil).toLocaleDateString()}` : ""}. Renueva para recuperar el acceso.</div>}
          {c.myOrderStatus === "awaiting_review" ? (
            <div className="out ok">✅ Tu comprobante está <b>en revisión</b>. El productor lo aprobará pronto; te notificaremos por correo.</div>
          ) : (<>
          {c.myOrderStatus === "failed" && <div className="err" style={{ marginBottom: 6 }}>Tu comprobante anterior fue rechazado. Adjunta uno nuevo.</div>}
          <div className="muted">Transfiere {money(c.priceCents, c.currency)} a una de estas cuentas y sube la foto/captura de tu comprobante:</div>
          {(c.manualAccounts && c.manualAccounts.length > 0) ? (
            <div style={{ margin: "10px 0" }}>
              {c.manualAccounts.map((a, i) => (
                <div key={i} className="row" style={{ padding: "8px 0" }}>
                  <div><b>{a.bank}</b> · {a.number}<div className="muted">{a.name}</div></div>
                  <button className="ghost" style={{ marginTop: 0, fontSize: 12, padding: "4px 10px" }} onClick={() => { navigator.clipboard?.writeText(a.number); flash("Número copiado ✔"); }}>Copiar</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ margin: "8px 0" }}>El productor aún no configuró cuentas de transferencia.</div>
          )}
          <label>Comprobante (imagen)</label>
          <FilePicker
            label="Adjuntar comprobante"
            hint="Foto o captura de la transferencia · se comprime sola"
            value={proofUrl || undefined}
            busy={busy}
            onPick={(f) => uploadProof(f)}
            onClear={() => setProofUrl("")}
          />
          <button onClick={payManual} disabled={!proofUrl || busy}>{busy ? "Subiendo…" : "Enviar comprobante"}</button>
          </>)}
        </div>
      )}
      {isMember && c.myMembership && (
        <div className="card" style={{ marginTop: 16 }}>
          <div>Tu estado: <span className="pill">{c.myMembership.role}</span> · Nivel {c.myMembership.level} · {c.myMembership.points} pts{c.myMembership.accessUntil && !isFree ? ` · acceso hasta ${new Date(c.myMembership.accessUntil).toLocaleDateString()} (${Math.max(0, Math.ceil((new Date(c.myMembership.accessUntil).getTime() - Date.now()) / 86400000))} días)` : ""}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, margin: "20px 0 12px", flexWrap: "wrap" }}>
        <TabBtn id="community" label="Community" />
        <TabBtn id="classroom" label="Classroom" />
        <TabBtn id="calendar" label="Calendar" />
        <TabBtn id="leaderboard" label="Leaderboards" />
        <TabBtn id="members" label={`Members (${members.length})`} />
        <TabBtn id="about" label="About" />
        {(c.affiliateEnabled || isManager) && <TabBtn id="affiliates" label="Afiliados" />}
        {isMember && <TabBtn id="chat" label="Chat" />}
        {isManager && <TabBtn id="income" label="Ingresos" />}
        {isManager && <TabBtn id="review" label={`Comprobantes (${pending.length})`} />}
        {isOwner && <TabBtn id="settings" label="Ajustes" />}
      </div>

      {tab === "community" && (
        <div className="card">
          {isMember ? (<>
            <input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Título (opcional)" />
            <textarea value={postBody} onChange={(e) => setPostBody(e.target.value)} rows={2} placeholder="Escribe algo…" style={{ marginTop: 8 }} />
            <input value={postCategory} onChange={(e) => setPostCategory(e.target.value)} placeholder="Categoría (opcional)" style={{ marginTop: 8 }} />
            <button onClick={publish} disabled={!postBody}>Publicar</button>
          </>) : <div className="muted">Únete para publicar.</div>}
          <div style={{ marginTop: 16 }}>
            {posts.length === 0 && <div className="muted">Aún no hay publicaciones.</div>}
            {posts.map((p) => (
              <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "12px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    {(p.pinned || p.category) && <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>{p.pinned && <span className="pill" style={{ color: "var(--accent2)" }}>📌 Fijado</span>}{p.category && <span className="pill">{p.category}</span>}</div>}
                    {p.title && <div style={{ fontWeight: 600 }}>{p.title}</div>}
                    <div>{p.body}</div>
                    <a href={`/u/${p.authorHandle}`} className="muted" style={{ textDecoration: "none" }}>{p.authorName}</a>
                  </div>
                  <button className="ghost" style={{ marginTop: 0 }} onClick={() => like(p.id)}>👍 {p.likeCount}</button>
                </div>
                {isManager && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="ghost" style={{ marginTop: 0, fontSize: 12, padding: "3px 8px" }} onClick={() => pinPost(p.id, !p.pinned)}>{p.pinned ? "Desfijar" : "📌 Fijar"}</button>
                    <button className="ghost" style={{ marginTop: 0, fontSize: 12, padding: "3px 8px", color: "#ffb4c4" }} onClick={() => delPost(p.id)}>🗑</button>
                  </div>
                )}
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
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Buscar miembro…" />
            <button className="ghost" style={{ marginTop: 0, whiteSpace: "nowrap" }} onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/c/${c.slug}`); flash("Link de invitación copiado ✔"); }}>Invitar</button>
          </div>
          {members.filter((m) => !memberQuery || m.displayName.toLowerCase().includes(memberQuery.toLowerCase()) || m.handle.toLowerCase().includes(memberQuery.toLowerCase())).map((m) => (
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
          <label>Precio mensual (0 = gratis)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={settings.priceUsd} onChange={(e) => setSettings({ ...settings, priceUsd: e.target.value })} />
            <select style={{ width: 100 }} value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
              <option value="USD">USD</option>
              <option value="COP">COP</option>
            </select>
          </div>
          <label>Ícono de la comunidad</label>
          <FilePicker
            label="Subir ícono"
            hint="Cuadrado, mínimo 256×256"
            value={settings.iconUrl || undefined}
            busy={busy}
            onPick={(f) => uploadIcon(f)}
            onClear={() => setSettings((s) => ({ ...s, iconUrl: "" }))}
          />
          {settings.iconUrl && <img src={settings.iconUrl} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", marginTop: 8, display: "block" }} />}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={settings.isPublic} onChange={(e) => setSettings({ ...settings, isPublic: e.target.checked })} />
            Pública (aparece en el descubrimiento)
          </label>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 15 }}>Programa de afiliados</h2>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={settings.affiliateEnabled} onChange={(e) => setSettings({ ...settings, affiliateEnabled: e.target.checked })} />
              Habilitar afiliados (miembros pueden promocionar y ganar comisión)
            </label>
            <label>Comisión por venta (% del precio)</label>
            <input value={settings.commissionPct} onChange={(e) => setSettings({ ...settings, commissionPct: e.target.value })} placeholder="Ej: 40" style={{ width: 120 }} />
            <label>Término de pago (net)</label>
            <select value={settings.payoutTermsDays} onChange={(e) => setSettings({ ...settings, payoutTermsDays: parseInt(e.target.value, 10) })} style={{ width: 160 }}>
              <option value={30}>Net 30 días</option>
              <option value={60}>Net 60 días</option>
            </select>
          </div>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15 }}>🏦 Transferencia manual</h2>
              <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <input type="checkbox" style={{ width: "auto" }} checked={manualEnabled} onChange={(e) => setManualEnabled(e.target.checked)} />
                Habilitar
              </label>
            </div>
            <div className="muted" style={{ marginBottom: 8 }}>El usuario transfiere y sube comprobante; tú apruebas. Estas cuentas se le muestran al elegir transferencia. Máximo 8.</div>
            {manualAccounts.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input style={{ flex: 1, minWidth: 90 }} placeholder="Banco (Nequi, BreB…)" value={a.bank} onChange={(e) => setManualAccounts(manualAccounts.map((x, j) => j === i ? { ...x, bank: e.target.value } : x))} />
                <input style={{ flex: 1, minWidth: 90 }} placeholder="Número / llave" value={a.number} onChange={(e) => setManualAccounts(manualAccounts.map((x, j) => j === i ? { ...x, number: e.target.value } : x))} />
                <input style={{ flex: 1, minWidth: 90 }} placeholder="Titular" value={a.name} onChange={(e) => setManualAccounts(manualAccounts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <button className="ghost" style={{ marginTop: 0, color: "#ffb4c4" }} onClick={() => setManualAccounts(manualAccounts.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {manualAccounts.length < 8 && <button className="ghost" style={{ marginTop: 0 }} onClick={() => setManualAccounts([...manualAccounts, { bank: "", number: "", name: "" }])}>+ Agregar cuenta</button>}
          </div>
          <button onClick={saveSettings} disabled={busy}>Guardar configuración</button>
        </div>
      )}

      {tab === "affiliates" && (
        <>
          {c.affiliateEnabled && (
            <div className="card">
              <h2>Programa de afiliados</h2>
              <div className="muted">Gana <b style={{ color: "var(--gold)" }}>{c.affiliateCommissionPct}%</b> por cada persona que se una con tu link. Pago Net {c.payoutTermsDays} días. Retiras desde <a href="/afiliados">tu panel de afiliado</a>.</div>
              {!c.myMembership && <div className="muted" style={{ marginTop: 8 }}>Únete a la comunidad para poder ser afiliado.</div>}
              {c.myMembership && !myAff && <button onClick={applyAffiliate}>Quiero ser afiliado</button>}
              {myAff && myAff.status === "pending" && <div style={{ marginTop: 10 }} className="pill">Solicitud pendiente de aprobación</div>}
              {myAff && myAff.status === "rejected" && <div style={{ marginTop: 10 }} className="err">Tu solicitud fue rechazada.</div>}
              {myAff && myAff.status === "approved" && (
                <div style={{ marginTop: 10 }}>
                  <label>Tu link de afiliado</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input readOnly value={affiliateLink} onFocus={(e) => e.target.select()} />
                    <button style={{ marginTop: 0 }} onClick={() => { navigator.clipboard?.writeText(affiliateLink); flash("Link copiado ✔"); }}>Copiar</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {isManager && (
            <>
              <div className="card" style={{ marginTop: 12 }}>
                <h2>Solicitudes de afiliado</h2>
                {applicants.length === 0 && <div className="muted">Sin solicitudes.</div>}
                {applicants.map((a) => (
                  <div className="row" key={a.userId}>
                    <div><a href={`/u/${a.handle}`} style={{ color: "var(--text)", textDecoration: "none" }}>{a.displayName}</a> <span className="pill">{a.status}</span></div>
                    {a.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ marginTop: 0, background: "var(--green)", color: "#04231a" }} onClick={() => reviewApplicant(a.userId, "approve")}>Autorizar</button>
                        <button className="ghost" style={{ marginTop: 0 }} onClick={() => reviewApplicant(a.userId, "reject")}>Rechazar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="card" style={{ marginTop: 12 }}>
                <h2>Solicitudes de payout</h2>
                {affPayouts.filter((p) => p.status === "requested").length === 0 && <div className="muted">Sin solicitudes de pago.</div>}
                {affPayouts.filter((p) => p.status === "requested").map((pp) => (
                  <div className="row" key={pp.id}>
                    <div>{pp.payeeName} · {money(pp.amountCents, pp.currency)}<div className="muted">{pp.method}</div></div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={{ marginTop: 0, background: "var(--green)", color: "#04231a" }} onClick={() => reviewPayout(pp.id, "approve")}>Autorizar pago</button>
                      <button className="ghost" style={{ marginTop: 0 }} onClick={() => reviewPayout(pp.id, "reject")}>Rechazar</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "income" && isManager && income && (
        <>
          <div className="grid">
            <div className="card"><div className="muted">Ingresos totales</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--green)" }}>{money(income.revenueCents, income.currency)}</div><div className="muted">{income.paidCount} pagos</div></div>
            <div className="card"><div className="muted">Miembros activos</div><div style={{ fontSize: 28, fontWeight: 700 }}>{income.activeMembers}</div></div>
            <div className="card"><div className="muted">Comisiones por pagar</div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--gold)" }}>{money(income.commissionsOwedCents, income.currency)}</div></div>
            <div className="card"><div className="muted">Payouts solicitados</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(income.pendingPayoutsCents, income.currency)}</div></div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Pagos recientes</h2>
            {income.recent.length === 0 && <div className="muted">Sin pagos aún.</div>}
            {income.recent.map((r, i) => (
              <div className="row" key={i}>
                <div>{r.userEmail}<div className="muted">{r.method} · {r.paidAt ? new Date(r.paidAt).toLocaleDateString() : ""}</div></div>
                <div>{money(r.amountCents, r.currency)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "review" && isManager && (
        <div className="card">
          <h2>Comprobantes por revisar</h2>
          {pending.length === 0 && <div className="muted">Nada pendiente.</div>}
          {pending.map((o) => (
            <div className="row" key={o.id}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {o.proofUrl
                  ? <a href={o.proofUrl} target="_blank" rel="noreferrer"><img src={o.proofUrl} alt="comprobante" style={{ height: 56, width: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} /></a>
                  : <div style={{ height: 56, width: 56, borderRadius: 8, border: "1px dashed var(--border)", display: "grid", placeItems: "center", fontSize: 10, color: "var(--muted)" }}>sin img</div>}
                <div>{o.userEmail}<div className="muted">{money(o.amountCents, o.currency)}</div></div>
              </div>
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
