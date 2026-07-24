"use client";

import { useCallback, useEffect, useState } from "react";
import { api, money } from "@/lib/api-client";

type Me = { handle: string; role: string } | null;
type Overview = { communities: number; users: number; pendingProducers: number; pendingProofs: number; pendingPayouts: number; grossRevenueCents: number };
type Producer = { id: string; displayName: string; email: string; handle: string; producerStatus: string };
type Proof = { id: string; amountCents: number; currency: string; proofUrl?: string; userEmail: string; communityName: string };

export default function AdminPage() {
  const [me, setMe] = useState<Me>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"overview" | "producers" | "proofs">("overview");
  const [ov, setOv] = useState<Overview | null>(null);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try { const m = await api(`/auth/me`); setMe(m); } catch { setMe(null); }
    setReady(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadData = useCallback(async () => {
    setOv(await api(`/admin/overview`).catch(() => null));
    setProducers(await api(`/admin/producers`).catch(() => []));
    setProofs(await api(`/admin/payments/pending`).catch(() => []));
  }, []);
  useEffect(() => { if (me?.role === "admin") loadData(); }, [me, loadData]);

  if (!ready) return <div className="container"><p className="muted">Cargando…</p></div>;
  if (!me) return <div className="container"><div className="brand"><div className="logo">K</div><h1>Klanly Admin</h1></div><div className="card" style={{ marginTop: 16 }}><div className="muted">Debes iniciar sesión con tu cuenta de administrador.</div><a href="/"><button style={{ marginTop: 10 }}>Ir a iniciar sesión</button></a></div></div>;
  if (me.role !== "admin") return <div className="container"><div className="card" style={{ marginTop: 16 }}><div className="err">Acceso restringido: esta sección es solo para el super administrador.</div><a href="/" className="muted">← Volver</a></div></div>;

  const reviewProducer = async (id: string, decision: "approve" | "reject") => {
    try { await api(`/admin/producers/${id}`, "PATCH", { decision }); flash(decision === "approve" ? "Productor aprobado ✔" : "Rechazado"); loadData(); }
    catch (e: any) { flash(e.message, false); }
  };
  const reviewProof = async (id: string, decision: "approve" | "reject") => {
    try { await api(`/payments/orders/${id}/review`, "POST", { decision }); flash(decision === "approve" ? "Aprobado ✔" : "Rechazado"); loadData(); }
    catch (e: any) { flash(e.message, false); }
  };

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button className={tab === id ? "" : "ghost"} style={{ marginTop: 0 }} onClick={() => setTab(id)}>{label}</button>
  );

  return (
    <div className="container">
      <div className="brand"><div className="logo">K</div><div><h1>Klanly Admin</h1><div className="muted">Consola del super administrador</div></div></div>
      {msg && <div className={`out ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      <div style={{ display: "flex", gap: 8, margin: "18px 0 12px", flexWrap: "wrap" }}>
        <Tab id="overview" label="Resumen" />
        <Tab id="producers" label={`Productores${ov?.pendingProducers ? ` (${ov.pendingProducers})` : ""}`} />
        <Tab id="proofs" label={`Comprobantes${ov?.pendingProofs ? ` (${ov.pendingProofs})` : ""}`} />
      </div>

      {tab === "overview" && ov && (
        <div className="grid">
          <div className="card"><div className="muted">Ingresos brutos</div><div style={{ fontSize: 26, fontWeight: 700, color: "var(--green)" }}>{money(ov.grossRevenueCents)}</div></div>
          <div className="card"><div className="muted">Comunidades</div><div style={{ fontSize: 26, fontWeight: 700 }}>{ov.communities}</div></div>
          <div className="card"><div className="muted">Usuarios</div><div style={{ fontSize: 26, fontWeight: 700 }}>{ov.users}</div></div>
          <div className="card"><div className="muted">Productores pendientes</div><div style={{ fontSize: 26, fontWeight: 700, color: "var(--gold)" }}>{ov.pendingProducers}</div></div>
          <div className="card"><div className="muted">Comprobantes por revisar</div><div style={{ fontSize: 26, fontWeight: 700, color: "var(--gold)" }}>{ov.pendingProofs}</div></div>
          <div className="card"><div className="muted">Payouts solicitados</div><div style={{ fontSize: 26, fontWeight: 700 }}>{ov.pendingPayouts}</div></div>
        </div>
      )}

      {tab === "producers" && (
        <div className="card">
          <h2>Solicitudes de productor</h2>
          <div className="muted" style={{ marginBottom: 8 }}>Aprueba a quienes pagan la suscripción mensual para poder publicar comunidades.</div>
          {producers.filter((p) => p.producerStatus === "pending").length === 0 && <div className="muted">Sin solicitudes pendientes.</div>}
          {producers.filter((p) => p.producerStatus === "pending").map((p) => (
            <div className="row" key={p.id}>
              <div><a href={`/u/${p.handle}`} style={{ color: "var(--text)", textDecoration: "none" }}>{p.displayName}</a><div className="muted">{p.email}</div></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ marginTop: 0, background: "var(--green)", color: "#04231a" }} onClick={() => reviewProducer(p.id, "approve")}>Aprobar</button>
                <button className="ghost" style={{ marginTop: 0 }} onClick={() => reviewProducer(p.id, "reject")}>Rechazar</button>
              </div>
            </div>
          ))}
          <h2 style={{ marginTop: 18 }}>Productores aprobados</h2>
          {producers.filter((p) => p.producerStatus === "approved").length === 0 && <div className="muted">Ninguno aún.</div>}
          {producers.filter((p) => p.producerStatus === "approved").map((p) => (
            <div className="row" key={p.id}><div>{p.displayName} <span className="muted">{p.email}</span></div><span className="pill" style={{ color: "var(--green)" }}>aprobado</span></div>
          ))}
        </div>
      )}

      {tab === "proofs" && (
        <div className="card">
          <h2>Comprobantes por revisar (global)</h2>
          {proofs.length === 0 && <div className="muted">Nada pendiente.</div>}
          {proofs.map((o) => (
            <div className="row" key={o.id}>
              <div>{o.userEmail} · {o.communityName}<div className="muted">{money(o.amountCents, o.currency)}{o.proofUrl ? " · " : ""}{o.proofUrl && <a href={o.proofUrl} target="_blank" rel="noreferrer">ver comprobante</a>}</div></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ marginTop: 0, background: "var(--green)", color: "#04231a" }} onClick={() => reviewProof(o.id, "approve")}>Aprobar</button>
                <button className="ghost" style={{ marginTop: 0 }} onClick={() => reviewProof(o.id, "reject")}>Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
