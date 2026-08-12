"use client";

import { useEffect, useState } from "react";
import { api, money } from "@/lib/api-client";
import TopBar from "@/components/TopBar";

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

  if (err) return <div className="container"><TopBar backHref="/pagos" backLabel="Historial" /><div className="out err" style={{ marginTop: 16 }}>{err}</div></div>;
  if (!inv) return <div className="container"><p className="muted">Cargando…</p></div>;

  const isPaid = inv.status === "paid";

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      {/* El botón va dentro del TopBar: anidarlo en un flex rompía la barra fija */}
      <TopBar
        backHref="/pagos"
        backLabel="Historial"
        title="Factura"
        right={<button className="ghost" style={{ marginTop: 0 }} onClick={() => window.print()}>Imprimir</button>}
      />
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h1>Factura</h1>
            <div className="meta">N.º {inv.invoiceNumber}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="brand" style={{ justifyContent: "flex-end" }}>
              <div className="logo">K</div>
              <b>Klanly</b>
            </div>
            <div className="meta">via klanly.app</div>
          </div>
        </div>

        <div className="grid" style={{ marginTop: 20 }}>
          <div>
            <div className="label">Para</div>
            <div>{inv.buyer?.name}</div>
            <div className="meta">{inv.buyer?.email}</div>
            {inv.buyer?.country && <div className="meta">{inv.buyer.country}</div>}
          </div>
          <div>
            <div className="label">Detalle</div>
            <div>Método: <span className="meta">{inv.method}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Estado:</span>
              {isPaid ? <span className="pill ok">Pagado</span> : <span className="pill">{inv.status}</span>}
            </div>
            {inv.paidAt && <div className="meta">Fecha: {new Date(inv.paidAt).toLocaleDateString()}</div>}
          </div>
        </div>

        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="row">
            <div>{inv.lineItem}</div>
            <div className="figure">{money(inv.amountCents, inv.currency)}</div>
          </div>
          <div className="row" style={{ borderBottom: "none", fontWeight: 700 }}>
            <div>Total ({inv.currency})</div>
            <div className="figure-lg">{money(inv.amountCents, inv.currency)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
