"use client";

import { useCallback, useEffect, useState } from "react";
import { api, money } from "@/lib/api-client";

type Membership = { role: string; status: string; level: number; points: number } | null;
type Community = {
  id: string; slug: string; name: string; description?: string;
  priceCents: number; currency: string; billingPeriod: string;
  memberCount: number; myMembership: Membership;
};
type Post = { id: string; title?: string; body?: string; likeCount: number; authorName: string; createdAt: string };
type Course = { id: string; title: string; description?: string; minLevel: number };
type Member = { userId: string; role: string; level: number; points: number; displayName: string; handle: string };
type PendingOrder = { id: string; reference: string; amountCents: number; currency: string; proofUrl?: string; userEmail: string; communityName: string };

export default function CommunityPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const [c, setC] = useState<Community | null>(null);
  const [tab, setTab] = useState<"community" | "classroom" | "members" | "review">("community");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<PendingOrder[]>([]);

  const [postBody, setPostBody] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [proofUrl, setProofUrl] = useState("");

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const com: Community = await api(`/communities/${slug}`);
      setC(com);
      const [p, cs, ms] = await Promise.all([
        api(`/communities/${slug}/posts`).catch(() => []),
        api(`/communities/${slug}/courses`).catch(() => []),
        api(`/communities/${slug}/members`).catch(() => []),
      ]);
      setPosts(p); setCourses(cs); setMembers(ms);
      const isManager = com.myMembership && (com.myMembership.role === "owner" || com.myMembership.role === "admin");
      if (isManager) setPending(await api(`/admin/payments/pending`).catch(() => []));
    } catch (e: any) { flash(e.message, false); }
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  if (!c) return <div className="container"><a href="/">← Volver</a><p className="muted" style={{ marginTop: 20 }}>Cargando…</p></div>;

  const isMember = c.myMembership && c.myMembership.status === "active";
  const isPending = c.myMembership && c.myMembership.status === "pending";
  const isManager = c.myMembership && (c.myMembership.role === "owner" || c.myMembership.role === "admin");
  const isFree = c.priceCents === 0 || c.billingPeriod === "free";

  const join = async () => {
    try {
      const r = await api(`/communities/${c.slug}/join`, "POST");
      if (r.requiresPayment) flash("Te uniste (pendiente de pago). Sube tu comprobante abajo.");
      else flash("¡Te uniste! ✔");
      load();
    } catch (e: any) { flash(e.message, false); }
  };
  const payManual = async () => {
    try {
      await api(`/payments/orders/manual`, "POST", { communityId: c.id, proofUrl });
      setProofUrl(""); flash("Comprobante enviado. Queda en revisión ✔"); load();
    } catch (e: any) { flash(e.message, false); }
  };
  const publish = async () => {
    try { await api(`/communities/${c.slug}/posts`, "POST", { body: postBody }); setPostBody(""); flash("Publicado ✔"); load(); }
    catch (e: any) { flash(e.message, false); }
  };
  const like = async (id: string) => { try { await api(`/posts/${id}/like`, "POST"); load(); } catch (e: any) { flash(e.message, false); } };
  const createCourse = async () => {
    try { await api(`/communities/${c.slug}/courses`, "POST", { title: courseTitle }); setCourseTitle(""); flash("Curso creado ✔"); load(); }
    catch (e: any) { flash(e.message, false); }
  };
  const review = async (id: string, decision: "approve" | "reject") => {
    try { await api(`/payments/orders/${id}/review`, "POST", { decision }); flash(decision === "approve" ? "Aprobado ✔" : "Rechazado"); load(); }
    catch (e: any) { flash(e.message, false); }
  };

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button className={tab === id ? "" : "ghost"} style={{ marginTop: 0 }} onClick={() => setTab(id)}>{label}</button>
  );

  return (
    <div className="container">
      <a href="/" className="muted">← Todas las comunidades</a>
      <div className="brand" style={{ marginTop: 12 }}>
        <div className="logo">{c.name.charAt(0).toUpperCase()}</div>
        <div>
          <h1>{c.name}</h1>
          <div className="muted">{isFree ? "Free" : `${money(c.priceCents, c.currency)}/${c.billingPeriod}`} · {c.memberCount} miembros · /{c.slug}</div>
        </div>
      </div>
      {c.description && <p className="muted" style={{ marginTop: 8 }}>{c.description}</p>}
      {msg && <div className={`out ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      {/* Estado de membresía / unirse / pago manual */}
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
          <div className="muted">Transfiere {money(c.priceCents, c.currency)} y pega el enlace de tu comprobante (imagen). El productor lo revisará.</div>
          <label>URL del comprobante</label>
          <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://…/comprobante.jpg" />
          <button onClick={payManual} disabled={!proofUrl}>Enviar comprobante</button>
        </div>
      )}
      {isMember && c.myMembership && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ borderBottom: "none" }}>
            <div>Tu estado: <span className="pill">{c.myMembership.role}</span> · Nivel {c.myMembership.level} · {c.myMembership.points} pts</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, margin: "20px 0 12px", flexWrap: "wrap" }}>
        <Tab id="community" label="Community" />
        <Tab id="classroom" label="Classroom" />
        <Tab id="members" label={`Members (${members.length})`} />
        {isManager && <Tab id="review" label={`Comprobantes (${pending.length})`} />}
      </div>

      {tab === "community" && (
        <div className="card">
          {isMember && (
            <>
              <textarea value={postBody} onChange={(e) => setPostBody(e.target.value)} rows={2} placeholder="Escribe algo para la comunidad…" />
              <button onClick={publish} disabled={!postBody}>Publicar</button>
            </>
          )}
          {!isMember && <div className="muted">Únete para publicar en el feed.</div>}
          <div style={{ marginTop: 16 }}>
            {posts.length === 0 && <div className="muted">Aún no hay publicaciones.</div>}
            {posts.map((p) => (
              <div className="row" key={p.id}>
                <div>
                  {p.title && <div style={{ fontWeight: 600 }}>{p.title}</div>}
                  <div>{p.body}</div>
                  <div className="muted">{p.authorName}</div>
                </div>
                <button className="ghost" style={{ marginTop: 0 }} onClick={() => like(p.id)}>👍 {p.likeCount}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "classroom" && (
        <div className="card">
          {isManager && (
            <>
              <label>Nuevo curso</label>
              <input value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Título del curso" />
              <button onClick={createCourse} disabled={!courseTitle}>Crear curso</button>
            </>
          )}
          <div style={{ marginTop: 16 }}>
            {courses.length === 0 && <div className="muted">Aún no hay cursos.</div>}
            {courses.map((co) => (
              <div className="row" key={co.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{co.title}</div>
                  {co.description && <div className="muted">{co.description}</div>}
                </div>
                <span className="pill">Nivel {co.minLevel}+</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "members" && (
        <div className="card">
          {members.map((m) => (
            <div className="row" key={m.userId}>
              <div>{m.displayName} <span className="muted">@{m.handle}</span></div>
              <div className="muted">{m.role} · Nv {m.level} · {m.points} pts</div>
            </div>
          ))}
        </div>
      )}

      {tab === "review" && isManager && (
        <div className="card">
          <h2>Comprobantes por revisar</h2>
          {pending.length === 0 && <div className="muted">Nada pendiente.</div>}
          {pending.map((o) => (
            <div className="row" key={o.id}>
              <div>
                <div>{o.userEmail} · {money(o.amountCents, o.currency)}</div>
                {o.proofUrl && <a href={o.proofUrl} target="_blank" rel="noreferrer">ver comprobante</a>}
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
