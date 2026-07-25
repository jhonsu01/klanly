"use client";

import { useCallback, useEffect, useState } from "react";
import { api, money } from "@/lib/api-client";

type Me = { handle: string; role: string; displayName?: string; email?: string } | null;
type Overview = { communities: number; users: number; pendingProducers: number; pendingProofs: number; pendingPayouts: number; grossRevenueCents: number };
type Producer = { id: string; displayName: string; email: string; handle: string; producerStatus: string };
type Proof = { id: string; amountCents: number; currency: string; proofUrl?: string; userEmail: string; communityName: string };
type Payout = { id: string; amountCents: number; currency: string; method?: string; status: string; payeeName: string; payeeEmail: string; communityName?: string };
type Com = { id: string; slug: string; name: string; priceCents: number; currency: string; isPublic: boolean; ownerName: string; ownerEmail: string; members: number; revenueCents: number };
type Audit = { id: number; action: string; entity?: string; entityId?: string; createdAt: string; actorName?: string };

type Section = "overview" | "producers" | "proofs" | "payouts" | "communities" | "audit" | "settings";

export default function AdminPage() {
  const [me, setMe] = useState<Me>(null);
  const [ready, setReady] = useState(false);
  const [sec, setSec] = useState<Section>("overview");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const [ov, setOv] = useState<Overview | null>(null);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [coms, setComs] = useState<Com[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => { (async () => { try { setMe(await api(`/auth/me`)); } catch { setMe(null); } setReady(true); })(); }, []);

  const refresh = useCallback(async () => {
    setOv(await api(`/admin/overview`).catch(() => null));
    setProducers(await api(`/admin/producers`).catch(() => []));
    setProofs(await api(`/admin/payments/pending`).catch(() => []));
    setPayouts(await api(`/admin/payouts`).catch(() => []));
    setComs(await api(`/admin/communities`).catch(() => []));
    setAudit(await api(`/admin/audit`).catch(() => []));
  }, []);
  useEffect(() => { if (me?.role === "admin") refresh(); }, [me, sec, refresh]);

  if (!ready) return <div className="container"><p className="muted">Cargando…</p></div>;
  if (!me) return <div className="container"><div className="brand"><div className="logo">K</div><h1>Klanly Admin</h1></div><div className="card" style={{ marginTop: 16 }}><div className="muted">Inicia sesión con tu cuenta de administrador.</div><a href="/"><button style={{ marginTop: 10 }}>Ir a iniciar sesión</button></a></div></div>;
  if (me.role !== "admin") return <div className="container"><div className="card" style={{ marginTop: 16 }}><div className="err">Acceso restringido: solo el super administrador.</div><a href="/" className="muted">← Volver</a></div></div>;

  const reviewProducer = async (id: string, d: "approve" | "reject") => { try { await api(`/admin/producers/${id}`, "PATCH", { decision: d }); flash(d === "approve" ? "Productor aprobado ✔" : "Rechazado"); refresh(); } catch (e: any) { flash(e.message, false); } };
  const reviewProof = async (id: string, d: "approve" | "reject") => { try { await api(`/payments/orders/${id}/review`, "POST", { decision: d }); flash(d === "approve" ? "Aprobado ✔" : "Rechazado"); refresh(); } catch (e: any) { flash(e.message, false); } };
  const reviewPayout = async (id: string, d: "approve" | "reject") => { try { await api(`/payouts/${id}`, "PATCH", { decision: d }); flash(d === "approve" ? "Payout pagado ✔" : "Rechazado"); refresh(); } catch (e: any) { flash(e.message, false); } };

  const pendingProducers = producers.filter((p) => p.producerStatus === "pending");
  const reqPayouts = payouts.filter((p) => p.status === "requested");

  const Item = ({ id, icon, label, badge }: { id: Section; icon: string; label: string; badge?: number }) => (
    <a className={sec === id ? "active" : ""} onClick={() => setSec(id)}>
      <span>{icon}</span><span style={{ flex: 1 }}>{label}</span>
      {badge ? <span className="pill" style={{ color: "var(--gold)" }}>{badge}</span> : null}
    </a>
  );

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="brand" style={{ padding: "0 6px 18px" }}><div className="logo">K</div><div><b>Klanly</b><div className="muted" style={{ fontSize: 11 }}>Admin Console</div></div></div>
        <nav className="admin-nav">
          <Item id="overview" icon="📊" label="Overview" />
          <Item id="producers" icon="🎬" label="Productores" badge={pendingProducers.length} />
          <Item id="proofs" icon="🧾" label="Comprobantes" badge={proofs.length} />
          <Item id="payouts" icon="💸" label="Payouts" badge={reqPayouts.length} />
          <Item id="communities" icon="👥" label="Comunidades" />
          <Item id="audit" icon="🔎" label="Auditoría" />
          <Item id="settings" icon="⚙️" label="Ajustes" />
        </nav>
      </aside>

      <main className="admin-main">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>Panel de administración</h1>
            <div className="muted" style={{ marginBottom: 20 }}>Supervisión global de la plataforma · cobros manuales, afiliados y liquidaciones</div>
          </div>
          <button className="ghost" style={{ marginTop: 0 }} onClick={refresh}>↻ Actualizar</button>
        </div>
        {msg && <div className={`out ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

        {sec === "overview" && ov && (
          <div className="stats">
            <div className="stat"><div className="k">Ingresos brutos</div><div className="v" style={{ color: "var(--green)" }}>{money(ov.grossRevenueCents)}</div></div>
            <div className="stat"><div className="k">Comprobantes por revisar</div><div className="v" style={{ color: "var(--gold)" }}>{ov.pendingProofs}</div></div>
            <div className="stat"><div className="k">Productores pendientes</div><div className="v" style={{ color: "var(--gold)" }}>{ov.pendingProducers}</div></div>
            <div className="stat"><div className="k">Payouts pendientes</div><div className="v">{ov.pendingPayouts}</div></div>
            <div className="stat"><div className="k">Comunidades</div><div className="v">{ov.communities}</div></div>
            <div className="stat"><div className="k">Usuarios</div><div className="v">{ov.users}</div></div>
          </div>
        )}

        {sec === "producers" && (
          <div className="card">
            <h2>Solicitudes de productor</h2>
            <div className="muted" style={{ marginBottom: 8 }}>Aprueba a quienes pagan la suscripción mensual para publicar comunidades.</div>
            {pendingProducers.length === 0 && <div className="muted">Sin solicitudes pendientes.</div>}
            {pendingProducers.map((p) => (
              <div className="row" key={p.id}>
                <div><a href={`/u/${p.handle}`} style={{ color: "var(--text)", textDecoration: "none" }}>{p.displayName}</a><div className="muted">{p.email}</div></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ marginTop: 0, background: "var(--green)", color: "#04231a" }} onClick={() => reviewProducer(p.id, "approve")}>Aprobar</button>
                  <button className="ghost" style={{ marginTop: 0 }} onClick={() => reviewProducer(p.id, "reject")}>Rechazar</button>
                </div>
              </div>
            ))}
            <h2 style={{ marginTop: 18 }}>Aprobados ({producers.filter((p) => p.producerStatus === "approved").length})</h2>
            {producers.filter((p) => p.producerStatus === "approved").map((p) => (
              <div className="row" key={p.id}><div>{p.displayName} <span className="muted">{p.email}</span></div><span className="pill" style={{ color: "var(--green)" }}>aprobado</span></div>
            ))}
          </div>
        )}

        {sec === "proofs" && (
          <div className="card">
            <h2>Cola de cobros manuales (global)</h2>
            {proofs.length === 0 && <div className="muted">Nada pendiente.</div>}
            {proofs.map((o) => (
              <div className="row" key={o.id}>
                <div>{o.userEmail} · {o.communityName}<div className="muted">{money(o.amountCents, o.currency)}{o.proofUrl && <> · <a href={o.proofUrl} target="_blank" rel="noreferrer">ver comprobante</a></>}</div></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ marginTop: 0, background: "var(--green)", color: "#04231a" }} onClick={() => reviewProof(o.id, "approve")}>Aprobar</button>
                  <button className="ghost" style={{ marginTop: 0 }} onClick={() => reviewProof(o.id, "reject")}>Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {sec === "payouts" && (
          <div className="card">
            <h2>Solicitudes de payout de afiliados (global)</h2>
            {reqPayouts.length === 0 && <div className="muted">Sin solicitudes.</div>}
            {reqPayouts.map((p) => (
              <div className="row" key={p.id}>
                <div>{p.payeeName} <span className="muted">{p.payeeEmail}</span>{p.communityName ? ` · ${p.communityName}` : ""}<div className="muted">{money(p.amountCents, p.currency)} · {p.method}</div></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ marginTop: 0, background: "var(--green)", color: "#04231a" }} onClick={() => reviewPayout(p.id, "approve")}>Autorizar pago</button>
                  <button className="ghost" style={{ marginTop: 0 }} onClick={() => reviewPayout(p.id, "reject")}>Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {sec === "communities" && (
          <div className="card">
            <h2>Comunidades ({coms.length})</h2>
            {coms.map((c) => (
              <div className="row" key={c.id}>
                <div><a href={`/c/${c.slug}`} target="_blank" rel="noreferrer" style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>{c.name}</a><div className="muted">{c.ownerName} · {c.members} miembros · {c.priceCents === 0 ? "Free" : money(c.priceCents, c.currency)}{!c.isPublic && " · oculta"}</div></div>
                <div style={{ color: "var(--green)" }}>{money(c.revenueCents, c.currency)}</div>
              </div>
            ))}
          </div>
        )}

        {sec === "audit" && (
          <div className="card">
            <h2>Auditoría</h2>
            {audit.length === 0 && <div className="muted">Sin registros.</div>}
            {audit.map((a) => (
              <div className="row" key={a.id}>
                <div><code style={{ fontSize: 12 }}>{a.action}</code>{a.entity ? <span className="muted"> · {a.entity}</span> : ""}<div className="muted">{a.actorName || "sistema"}</div></div>
                <div className="muted" style={{ fontSize: 12 }}>{new Date(a.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        {sec === "settings" && (
          <div className="card">
            <h2>Ajustes</h2>
            <div className="row"><div className="muted">Super administrador</div><div>{me.displayName} · {me.email}</div></div>
            <div className="muted" style={{ marginTop: 12 }}>
              La suscripción mensual de los productores se aprueba manualmente (el productor paga por fuera y tú lo apruebas en "Productores").
              Automatizar el cobro recurrente es un paso siguiente.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
