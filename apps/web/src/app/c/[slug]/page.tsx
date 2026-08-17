"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, money, uploadFile, askStepUp } from "@/lib/api-client";
import FilePicker from "@/components/FilePicker";
import ImageViewer from "@/components/ImageViewer";
import TopBar from "@/components/TopBar";
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
  const [viewer, setViewer] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  // ¿Quedan pestañas fuera del ancho visible? Controla el degradado del borde
  const [hayMasTabs, setHayMasTabs] = useState(false);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };
  // Pestañas que quedan detrás del botón "Más" de la barra inferior
  const moreTabs: Tab[] = ["calendar", "members", "about", "affiliates", "income", "review", "settings"];
  const goTab = (t: Tab) => { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); };
  // Iniciales del autor para el avatar del feed
  const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

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

  // La barra inferior existe solo en esta pantalla: marcamos el body para que
  // el contenedor reserve el espacio y los toasts no queden debajo.
  useEffect(() => {
    document.body.classList.add("has-bottomnav");
    return () => document.body.classList.remove("has-bottomnav");
  }, []);

  // La tira de pestañas se desplaza en horizontal: hay que avisar de que queda
  // contenido fuera y llevar la pestaña activa a la vista (si no, "Ajustes"
  // quedaba invisible y el productor no encontraba sus cuentas de cobro).
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const medir = () => setHayMasTabs(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    el.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return () => { el.removeEventListener("scroll", medir); window.removeEventListener("resize", medir); };
  }, [tab, c]);

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
  // Días de acceso restantes (se muestran como insignia en el encabezado)
  const daysLeft = c.myMembership?.accessUntil && !isFree
    ? Math.max(0, Math.ceil((new Date(c.myMembership.accessUntil).getTime() - Date.now()) / 86400000))
    : null;
  // Paso visible del flujo de activacion: transferir -> adjuntar -> revision
  const payStep = c.myOrderStatus === "awaiting_review" ? 3 : proofUrl ? 2 : 1;

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

  // Pestaña con indicador de subrayado y contador en mono (sistema Nocturno)
  const TabBtn = ({ id, label, count, alert }: { id: Tab; label: string; count?: number; alert?: boolean }) => (
    <button className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
      {label}
      {count !== undefined && count > 0 && <span className={`count${alert ? " alert" : ""}`}>{count}</span>}
    </button>
  );

  return (
    <div className="container">
      <TopBar
        backHref="/"
        backLabel="Comunidades"
        title={c.name}
        right={
          <button className="icon-btn" onClick={openNotis} title="Notificaciones" aria-label="Notificaciones">
            🔔
            {notis.unread > 0 && <span className="badge">{notis.unread > 9 ? "9+" : notis.unread}</span>}
          </button>
        }
      />
      {showNotis && (
        <div className="card" style={{ marginTop: 8 }}>
          <h2>Notificaciones</h2>
          {notis.items.length === 0 && <div className="muted">Sin notificaciones.</div>}
          {notis.items.map((n) => <div className="row" key={n.id}><div>{n.body}</div></div>)}
        </div>
      )}

      <div className="brand" style={{ marginTop: 12 }}>
        {c.iconUrl
          ? <img src={c.iconUrl} alt="" style={{ width: 46, height: 46, borderRadius: 13, objectFit: "cover", flex: "none" }} />
          : <div className="logo" style={{ width: 46, height: 46, borderRadius: 13, fontSize: 22 }}>{c.name.charAt(0).toUpperCase()}</div>}
        <div style={{ minWidth: 0 }}>
          <h1>{c.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginTop: 7 }}>
            <span className="meta" style={{ color: "var(--muted)" }}>{c.memberCount} MIEMBROS</span>
            <span className="dot" />
            <span className="meta" style={{ color: isFree ? "var(--muted)" : "var(--gold)" }}>
              {isFree ? "GRATIS" : `${money(c.priceCents, c.currency)} / ${c.billingPeriod === "month" ? "MES" : c.billingPeriod === "year" ? "AÑO" : "ÚNICO"}`}
            </span>
            <span className="dot" />
            <span className="meta">/{c.slug}</span>
            {daysLeft !== null && <span className="pill ok">Tu acceso · {daysLeft} días</span>}
          </div>
        </div>

        {/* Acciones del dueño SIEMPRE visibles aquí, no dentro de la tira de
            pestañas: con muchas pestañas, "Ajustes" quedaba fuera del ancho y
            el productor no encontraba dónde poner sus cuentas de cobro. */}
        {isOwner && (
          <div className="brand-acciones">
            <button className="ghost" style={{ marginTop: 0 }} onClick={() => goTab("settings")}>
              ⚙️ Ajustes
            </button>
          </div>
        )}
      </div>
      {c.description && <p className="muted" style={{ marginTop: 8 }}>{c.description}</p>}

      {/* Una comunidad que cobra sin cuentas configuradas no puede cobrar: el
          miembro llega al paso de pagar y no ve a dónde transferir. */}
      {isOwner && !isFree && manualEnabled && manualAccounts.filter((a) => a.number.trim()).length === 0 && (
        <div className="aviso-owner">
          <div className="label" style={{ color: "var(--gold)" }}>Falta configurar tus cuentas de cobro</div>
          <p>
            Tu comunidad cobra {money(c.priceCents, c.currency)}, pero todavía no
            has puesto dónde recibir el dinero. Tus miembros ven el precio y no
            pueden pagarte.
          </p>
          <button style={{ marginTop: 12 }} onClick={() => goTab("settings")}>
            Poner mis cuentas de cobro
          </button>
        </div>
      )}
      {msg && <div className={`toast ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}
      {viewer && <ImageViewer src={viewer} onClose={() => setViewer(null)} />}

      {!c.myMembership && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Unirte</h2>
          <div className="muted">{isFree ? "Comunidad gratuita." : `Membresía ${money(c.priceCents, c.currency)}/${c.billingPeriod}.`}</div>
          <button onClick={join}>{isFree ? "Unirme gratis" : "Unirme"}</button>
        </div>
      )}
      {isPending && (
        <div className="card" style={{ marginTop: 16 }}>
          {/* Activar acceso en 3 pasos: transferir → adjuntar → revisión */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ marginBottom: 0 }}>{isPastDue ? "Renovar mi acceso" : "Activar mi acceso"}</h2>
            <span className="label">PASO {payStep} DE 3</span>
          </div>
          <div className="steps">
            <i className={payStep >= 1 ? "on" : ""} />
            <i className={payStep >= 2 ? "on" : ""} />
            <i className={payStep >= 3 ? "on" : ""} />
          </div>

          {isPastDue && (
            <div className="err" style={{ marginTop: 10 }}>
              Tu acceso venció{c.myMembership?.accessUntil ? ` el ${new Date(c.myMembership.accessUntil).toLocaleDateString()}` : ""}. Renueva para recuperarlo.
            </div>
          )}

          {c.myOrderStatus === "awaiting_review" ? (
            <div style={{ marginTop: 14, padding: "16px 17px", borderRadius: 16, background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.28)" }}>
              <div className="label" style={{ color: "var(--green)" }}>● EN REVISIÓN</div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "var(--body)" }}>
                Recibimos tu comprobante. El productor lo revisa y te avisamos por correo.
                Suele tardar menos de 12 horas.
              </div>
            </div>
          ) : (<>
            {c.myOrderStatus === "failed" && (
              <div className="err" style={{ marginTop: 10 }}>Tu comprobante anterior fue rechazado. Adjunta uno nuevo.</div>
            )}

            {/* El monto exacto es la cifra protagonista */}
            <div style={{ marginTop: 14, padding: "16px 17px", borderRadius: 16, background: "rgba(246,198,103,.07)", border: "1px solid rgba(246,198,103,.22)" }}>
              <div className="label" style={{ color: "var(--gold)" }}>Transfiere exactamente</div>
              <div className="figure-lg" style={{ marginTop: 8 }}>{money(c.priceCents, c.currency)}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {c.name} · {c.billingPeriod === "month" ? "1 mes" : c.billingPeriod === "year" ? "1 año" : "acceso"} de acceso
              </div>
            </div>

            {(c.manualAccounts && c.manualAccounts.length > 0) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {c.manualAccounts.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: "var(--input)", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--accent3)", flex: "none" }}>
                      {a.bank.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.bank}</div>
                      <div className="meta" style={{ marginTop: 3, color: "var(--muted)", overflowWrap: "anywhere" }}>{a.number}</div>
                      {a.name && <div className="muted" style={{ fontSize: 12 }}>{a.name}</div>}
                    </div>
                    <button
                      className="ghost"
                      style={{ marginTop: 0, minHeight: 44, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em" }}
                      onClick={() => { navigator.clipboard?.writeText(a.number); flash("Número copiado ✔"); }}
                    >COPIAR</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ margin: "12px 0" }}>El productor aún no configuró cuentas de transferencia.</div>
            )}

            <label>Comprobante</label>
            <FilePicker
              label="Toma la foto del comprobante"
              hint="o elígela de la galería · se comprime sola"
              value={proofUrl || undefined}
              busy={busy}
              onPick={(f) => uploadProof(f)}
              onClear={() => setProofUrl("")}
            />
            <div className="muted" style={{ textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
              El productor la revisa y te avisamos por correo. Suele tardar menos de 12 horas.
            </div>

            {/* Acción principal anclada: no se pierde al final del scroll */}
            <div className="action-bar">
              <button onClick={payManual} disabled={!proofUrl || busy}>
                {busy ? "Subiendo…" : "Enviar comprobante"}
              </button>
            </div>
          </>)}
        </div>
      )}
      {isMember && c.myMembership && (
        <div className="card" style={{ marginTop: 16 }}>
          <div>Tu estado: <span className="pill">{c.myMembership.role}</span> · Nivel {c.myMembership.level} · {c.myMembership.points} pts{c.myMembership.accessUntil && !isFree ? ` · acceso hasta ${new Date(c.myMembership.accessUntil).toLocaleDateString()} (${Math.max(0, Math.ceil((new Date(c.myMembership.accessUntil).getTime() - Date.now()) / 86400000))} días)` : ""}</div>
        </div>
      )}

      <div className={`tabs-wrap${hayMasTabs ? " hay-mas" : ""}`}>
        <div className="tabs" ref={tabsRef}>
        <TabBtn id="community" label="Comunidad" />
        <TabBtn id="classroom" label="Classroom" count={courses.length} />
        <TabBtn id="calendar" label="Calendario" count={evs.length} />
        <TabBtn id="leaderboard" label="Ranking" />
        <TabBtn id="members" label="Miembros" count={members.length} />
        {isMember && <TabBtn id="chat" label="Chat" />}
        {(c.affiliateEnabled || isManager) && <TabBtn id="affiliates" label="Afiliados" />}
        {isManager && <TabBtn id="income" label="Ingresos" />}
        {isManager && <TabBtn id="review" label="Comprobantes" count={pending.length} alert />}
        <TabBtn id="about" label="Acerca de" />
          {isOwner && <TabBtn id="settings" label="Ajustes" />}
        </div>
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
              <div key={p.id} className="post">
                {/* Cabecera del post: autor con inicial, meta en mono y estado */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="post-av">{initials(p.authorName)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a href={`/u/${p.authorHandle}`} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600, fontSize: 13.5 }}>{p.authorName}</a>
                    {p.authorHandle && <div className="meta" style={{ marginTop: 3, fontSize: 10, letterSpacing: ".04em", textTransform: "uppercase" }}>@{p.authorHandle}</div>}
                  </div>
                  {p.pinned && <span className="pill">Fijado</span>}
                  {p.category && <span className="pill brand">{p.category}</span>}
                </div>

                {p.title && <div style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.35, marginTop: 12 }}>{p.title}</div>}
                {p.body && <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--body)", marginTop: 7, overflowWrap: "anywhere" }}>{p.body}</div>}

                {/* Fila de acciones separada por una línea, como en el diseño */}
                <div className="post-actions">
                  <button className="pact on" onClick={() => like(p.id)}>
                    ▲ <span style={{ fontFamily: "var(--font-mono)" }}>{p.likeCount}</span>
                  </button>
                  {isMember && (
                    <button className="pact" onClick={() => toggleComments(p.id)}>
                      ▭ <span style={{ fontFamily: "var(--font-mono)" }}>{(comments[p.id] || []).length || ""}</span>
                    </button>
                  )}
                </div>
                {isManager && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="ghost" style={{ marginTop: 0, fontSize: 12, padding: "3px 8px" }} onClick={() => pinPost(p.id, !p.pinned)}>{p.pinned ? "Desfijar" : "📌 Fijar"}</button>
                    <button className="ghost" style={{ marginTop: 0, fontSize: 12, padding: "3px 8px", color: "#ffb4c4" }} onClick={() => delPost(p.id)}>🗑</button>
                  </div>
                )}
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
            <div className="proof-row" key={o.id}>
              {o.proofUrl
                ? <img className="proof-thumb" src={o.proofUrl} alt="comprobante" title="Ver en grande" onClick={() => setViewer(o.proofUrl!)} />
                : <div style={{ height: 56, width: 56, borderRadius: 8, border: "1px dashed var(--border)", display: "grid", placeItems: "center", fontSize: 10, color: "var(--muted)" }}>sin img</div>}
              <div className="proof-info">
                {o.userEmail}
                <div className="muted">{money(o.amountCents, o.currency)}</div>
              </div>
              <div className="proof-actions">
                {o.proofUrl && <button className="ghost" onClick={() => setViewer(o.proofUrl!)}>🔍 Ver</button>}
                <button style={{ background: "var(--green)", color: "#04231a" }} onClick={() => review(o.id, "approve")}>Aprobar</button>
                <button className="ghost" onClick={() => review(o.id, "reject")}>Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Barra inferior (solo móvil): las 10 pestañas no caben en 412 px, así
          que bajan las 5 principales y el resto vive en "Más". */}
      <nav className="bottomnav">
        <button className={`bn${tab === "community" ? " active" : ""}`} onClick={() => goTab("community")}>
          <span className="bn-i">▣</span><span className="bn-t">FEED</span>
        </button>
        <button className={`bn${tab === "classroom" ? " active" : ""}`} onClick={() => goTab("classroom")}>
          <span className="bn-i">▤</span><span className="bn-t">CURSOS</span>
        </button>
        <button className={`bn${tab === "leaderboard" ? " active" : ""}`} onClick={() => goTab("leaderboard")}>
          <span className="bn-i">▲</span><span className="bn-t">RANKING</span>
        </button>
        <button className={`bn${tab === "chat" ? " active" : ""}`} onClick={() => goTab(isMember ? "chat" : "about")}>
          <span className="bn-i">▭</span><span className="bn-t">{isMember ? "CHAT" : "INFO"}</span>
        </button>
        <button className={`bn${moreTabs.includes(tab) ? " active" : ""}`} onClick={() => setShowMore(true)}>
          <span className="bn-i">●</span><span className="bn-t">MÁS</span>
        </button>
      </nav>

      {showMore && (
        <div className="sheet-overlay" onClick={() => setShowMore(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="label" style={{ marginBottom: 12 }}>Más secciones</div>
            {([
              ["calendar", "🗓", "Calendario"],
              ["members", "👥", "Miembros"],
              ["about", "ℹ️", "Acerca de"],
              ...(c.affiliateEnabled || isManager ? [["affiliates", "💰", "Afiliados"]] : []),
              ...(isManager ? [["income", "📊", "Ingresos"]] : []),
              ...(isManager ? [["review", "🧾", `Comprobantes${pending.length ? ` (${pending.length})` : ""}`]] : []),
              ...(isOwner ? [["settings", "⚙️", "Ajustes"]] : []),
            ] as [Tab, string, string][]).map(([id, icon, label]) => (
              <button key={id} className="sheet-item" onClick={() => { goTab(id); setShowMore(false); }}>
                <span>{icon}</span><span style={{ flex: 1, textAlign: "left" }}>{label}</span>
                {tab === id && <span className="meta" style={{ color: "var(--accent3)" }}>ACTUAL</span>}
              </button>
            ))}
            <button className="ghost" style={{ width: "100%" }} onClick={() => setShowMore(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
