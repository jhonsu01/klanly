"use client";

import { useEffect, useState } from "react";
import { api, money } from "@/lib/api-client";

type Invoice = {
  invoiceNumber: string; status: string; createdAt: string; paidAt?: string | null;
  method: string; amountCents: number; currency: string;
  community: { name: string; slug: string } | null;
  buyer: { name: string; email: string; country?: string | null } | null;
  lineItem: string;
};

export default function InvoicePage({ params }: { params: { id: string } }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api(`/payments/orders/${params.id}`).then(setInv).catch((e) => setErr(e.message)); }, [params.id]);

  if (err) return <div className="container"><a href="/pagos" className="muted">← Historial</a><div className="out err" style={{ marginTop: 16 }}>{err}</div></div>;
  if (!inv) return <div className="container"><p className="muted">Cargando…</p></div>;

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <a href="/pagos" className="muted">← Historial</a>
        <button className="ghost" style={{ marginTop: 0 }} onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><h1>Factura</h1><div className="muted">N.º {inv.invoiceNumber}</div></div>
          <div style={{ textAlign: "right" }}>
            <div className="brand" style={{ justifyContent: "flex-end" }}><div className="logo" style={{ width: 30, height: 30, fontSize: 16 }}>K</div><b>Klanly</b></div>
            <div className="muted" style={{ fontSize: 12 }}>via klanly.app</div>
          </div>
        </div>

        <div className="grid" style={{ marginTop: 20 }}>
          <div>
            <div className="muted">Para</div>
            <div>{inv.buyer?.name}</div>
            <div className="muted">{inv.buyer?.email}</div>
            {inv.buyer?.country && <div className="muted">{inv.buyer.country}</div>}
          </div>
          <div>
            <div className="muted">Detalle</div>
            <div>Método: {inv.method}</div>
            <div>Estado: {inv.status === "paid" ? "Pagado" : inv.status}</div>
            {inv.paidAt && <div className="muted">Fecha: {new Date(inv.paidAt).toLocaleDateString()}</div>}
          </div>
        </div>

        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="row"><div>{inv.lineItem}</div><div>{money(inv.amountCents, inv.currency)}</div></div>
          <div className="row" style={{ borderBottom: "none", fontWeight: 700 }}><div>Total ({inv.currency})</div><div>{money(inv.amountCents, inv.currency)}</div></div>
        </div>
      </div>
    </div>
  );
}
