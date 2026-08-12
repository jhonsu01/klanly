"use client";

import { useCallback, useEffect, useState } from "react";
import { api, money, askStepUp } from "@/lib/api-client";
import TopBar from "@/components/TopBar";

type Account = { communityId: string; slug: string; name: string; code: string; status: string; commissionPct: number; payoutTermsDays: number };
type Balance = { pendingCents: number; availableCents: number; requestedCents: number; paidCents: number };
type Data = {
  accounts: Account[];
  balance: Balance;
  payoutMethod: { type: string; details: string } | null;
  recent: { amountCents: number; currency: string; status: string; availableAt: string; inPayout: boolean; communityId: string }[];
};

export default function AffiliatesPage() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [pm, setPm] = useState({ type: "nequi", accountName: "", details: "" });

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };
  const load = useCallback(async () => {
    try {
      const data: Data = await api(`/affiliates/me`); setD(data);
      if (data.payoutMethod) setPm({ type: data.payoutMethod.type, accountName: (data.payoutMethod as any).accountName || "", details: data.payoutMethod.details });
    }
    catch (e: any) { flash(e.message, false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div className="container"><TopBar backHref="/" backLabel="Inicio" title="Afiliados" /><div className="card" style={{ marginTop: 20, textAlign: "center" }}><p className="muted">Cargando…</p></div></div>;

  const savePm = async () => {
    try {
      const code = await askStepUp("el cambio de tu medio de pago");
      if (!code) return;
      await api(`/affiliates/payout-method`, "POST", { ...pm, code });
      flash("Medio de pago guardado ✔");
      load();
    } catch (e: any) { flash(e.message, false); }
  };
  const requestPayout = async (communityId: string) => { try { const r = await api(`/affiliates/payouts`, "POST", { communityId }); flash(`Payout solicitado: ${money(r.amountCents, r.currency)}. El productor debe autorizarlo.`); load(); } catch (e: any) { flash(e.message, false); } };
  const copy = (code: string, slug: string) => { const link = `${window.location.origin}/c/${slug}?ref=${code}`; navigator.clipboard?.writeText(link); flash("Link copiado ✔"); };

  const b = d.balance;
  const approved = d.accounts.filter((a) => a.status === "approved");

  return (
    <div className="container">
      <TopBar backHref="/" backLabel="Inicio" title="Afiliados" />
      <div className="brand" style={{ marginTop: 12 }}>
        <div className="logo">$</div>
        <div>
          <h1>Afiliados</h1>
          <div className="muted">Tus comisiones y liquidaciones</div>
        </div>
      </div>
      {msg && <div className={`toast ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="label">Disponible para retirar</div>
          <div className="figure-lg" style={{ color: "var(--green)", marginTop: 8 }}>{money(b.availableCents)}</div>
        </div>
        <div className="card">
          <div className="label">Pendiente (aún en net 30/60)</div>
          <div className="figure-lg" style={{ color: "var(--gold)", marginTop: 8 }}>{money(b.pendingCents)}</div>
        </div>
        <div className="card">
          <div className="label">En proceso de pago</div>
          <div className="figure" style={{ color: "var(--text)", marginTop: 8 }}>{money(b.requestedCents)}</div>
        </div>
        <div className="card">
          <div className="label">Pagado (histórico)</div>
          <div className="figure" style={{ color: "var(--body)", marginTop: 8 }}>{money(b.paidCents)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Medio de pago (dónde recibes)</h2>
        
        <label className="label" style={{ display: "block", marginTop: 16 }}>Tipo</label>
        <select value={pm.type} onChange={(e) => setPm({ ...pm, type: e.target.value })} style={{ width: "100%" }}>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="bancolombia">Bancolombia</option>
          <option value="bank">Cuenta bancaria</option>
          <option value="paypal">PayPal</option>
          <option value="otro">Otro</option>
        </select>
        
        <label className="label" style={{ display: "block", marginTop: 16 }}>Nombre del titular (opcional)</label>
        <input value={pm.accountName} onChange={(e) => setPm({ ...pm, accountName: e.target.value })} placeholder="Ej: Jhon Supelano" style={{ width: "100%" }} />
        
        <label className="label" style={{ display: "block", marginTop: 16 }}>Número de cuenta o llave</label>
        <input value={pm.details} onChange={(e) => setPm({ ...pm, details: e.target.value })} placeholder="Ej: 300 123 4567 / correo@… / nº cuenta" style={{ width: "100%" }} />
        
        <button onClick={savePm} disabled={!pm.details} style={{ width: "100%", marginTop: 20 }}>Guardar medio de pago</button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Mis links de afiliado</h2>
        {approved.length === 0 && <p className="muted">Aún no eres afiliado aprobado en ninguna comunidad. Entra a una comunidad con afiliados y solicita unirte.</p>}
        {approved.map((a) => (
          <div className="row" key={a.communityId} style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
            <div>
              <a href={`/c/${a.slug}`} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600, fontSize: 16 }}>{a.name}</a>
              <div className="meta" style={{ marginTop: 4 }}>{a.commissionPct}% comisión · Net {a.payoutTermsDays} días · Código: {a.code}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ flex: 1 }} onClick={() => copy(a.code, a.slug)}>Copiar link</button>
              <button style={{ flex: 1 }} onClick={() => requestPayout(a.communityId)}>Retirar</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Movimientos recientes</h2>
        {d.recent.length === 0 && <p className="muted">Sin comisiones aún.</p>}
        {d.recent.map((r, i) => {
          const isPaid = r.status === "paid";
          const statusText = isPaid ? "pagado" : r.inPayout ? "en pago" : new Date(r.availableAt).getTime() <= Date.now() ? "disponible" : "pendiente";
          const pillClass = isPaid ? "ok" : (r.inPayout ? "brand" : (new Date(r.availableAt).getTime() <= Date.now() ? "ok" : "bad"));
          
          return (
            <div className="row" key={i} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="figure">{money(r.amountCents, r.currency)}</span>
                <span className={`pill ${pillClass}`}>{statusText}</span>
              </div>
              <div className="meta">Disponible {new Date(r.availableAt).toLocaleDateString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
