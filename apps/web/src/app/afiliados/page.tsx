"use client";

import { useCallback, useEffect, useState } from "react";
import { api, money } from "@/lib/api-client";

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

  if (!d) return <div className="container"><a href="/" className="muted">← Volver</a><p className="muted" style={{ marginTop: 20 }}>Cargando…</p></div>;

  const savePm = async () => { try { await api(`/affiliates/payout-method`, "POST", pm); flash("Medio de pago guardado ✔"); load(); } catch (e: any) { flash(e.message, false); } };
  const requestPayout = async (communityId: string) => { try { const r = await api(`/affiliates/payouts`, "POST", { communityId }); flash(`Payout solicitado: ${money(r.amountCents, r.currency)}. El productor debe autorizarlo.`); load(); } catch (e: any) { flash(e.message, false); } };
  const copy = (code: string, slug: string) => { const link = `${window.location.origin}/c/${slug}?ref=${code}`; navigator.clipboard?.writeText(link); flash("Link copiado ✔"); };

  const b = d.balance;
  const approved = d.accounts.filter((a) => a.status === "approved");

  return (
    <div className="container">
      <a href="/" className="muted">← Volver</a>
      <div className="brand" style={{ marginTop: 12 }}><div className="logo">$</div><div><h1>Afiliados</h1><div className="muted">Tus comisiones y liquidaciones</div></div></div>
      {msg && <div className={`out ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card"><div className="muted">Disponible para retirar</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--green)" }}>{money(b.availableCents)}</div></div>
        <div className="card"><div className="muted">Pendiente (aún en net 30/60)</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--gold)" }}>{money(b.pendingCents)}</div></div>
        <div className="card"><div className="muted">En proceso de pago</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(b.requestedCents)}</div></div>
        <div className="card"><div className="muted">Pagado (histórico)</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(b.paidCents)}</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Medio de pago (dónde recibes)</h2>
        <label>Tipo</label>
        <select value={pm.type} onChange={(e) => setPm({ ...pm, type: e.target.value })}>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="bancolombia">Bancolombia</option>
          <option value="bank">Cuenta bancaria</option>
          <option value="paypal">PayPal</option>
          <option value="otro">Otro</option>
        </select>
        <label>Nombre del titular (opcional)</label>
        <input value={pm.accountName} onChange={(e) => setPm({ ...pm, accountName: e.target.value })} placeholder="Ej: Jhon Supelano" />
        <label>Número de cuenta o llave</label>
        <input value={pm.details} onChange={(e) => setPm({ ...pm, details: e.target.value })} placeholder="Ej: 300 123 4567 / correo@… / nº cuenta" />
        <button onClick={savePm} disabled={!pm.details}>Guardar medio de pago</button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Mis links de afiliado</h2>
        {approved.length === 0 && <div className="muted">Aún no eres afiliado aprobado en ninguna comunidad. Entra a una comunidad con afiliados y solicita unirte.</div>}
        {approved.map((a) => (
          <div className="row" key={a.communityId}>
            <div>
              <a href={`/c/${a.slug}`} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>{a.name}</a>
              <div className="muted">{a.commissionPct}% · Net {a.payoutTermsDays} días · code {a.code}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ghost" style={{ marginTop: 0 }} onClick={() => copy(a.code, a.slug)}>Copiar link</button>
              <button style={{ marginTop: 0 }} onClick={() => requestPayout(a.communityId)}>Retirar</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Movimientos recientes</h2>
        {d.recent.length === 0 && <div className="muted">Sin comisiones aún.</div>}
        {d.recent.map((r, i) => (
          <div className="row" key={i}>
            <div>{money(r.amountCents, r.currency)} <span className="pill">{r.status === "paid" ? "pagado" : r.inPayout ? "en pago" : new Date(r.availableAt).getTime() <= Date.now() ? "disponible" : "pendiente"}</span></div>
            <div className="muted">disponible {new Date(r.availableAt).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
