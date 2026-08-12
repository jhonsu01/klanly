"use client";

import { useEffect, useState } from "react";
import { api, money } from "@/lib/api-client";
import TopBar from "@/components/TopBar";

type Row = {
  id: string; amountCents: number; currency: string; method: string; status: string;
  createdAt: string; paidAt?: string | null; communityName: string; communitySlug: string;
};

const STATUS: Record<string, string> = {
  paid: "Pagado", awaiting_review: "En revisión", pending: "Pendiente", failed: "Rechazado", expired: "Expirado", refunded: "Reembolsado",
};

export default function PaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api("/payments/history").then(setRows).catch((e) => setErr(e.message)); }, []);

  return (
    <div className="container">
      <TopBar backHref="/" backLabel="Inicio" title="Mis pagos" />
      <div className="brand" style={{ marginTop: 12 }}>
        <div className="logo">🧾</div>
        <div>
          <h1>Historial de pagos</h1>
          <div className="muted">Tus membresías y comprobantes</div>
        </div>
      </div>
      {err && <div className="out err">{err}</div>}
      <div className="card" style={{ marginTop: 16 }}>
        {rows.length === 0 && <div className="muted">Aún no tienes pagos.</div>}
        {rows.map((r) => (
          <div className="row" key={r.id}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.communityName}</div>
              <div className="meta">
                <span className="figure">{money(r.amountCents, r.currency)}</span> · {r.method} · {new Date(r.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={`pill ${r.status === "paid" ? "ok" : r.status === "failed" || r.status === "refunded" ? "bad" : r.status === "awaiting_review" ? "brand" : ""}`}>
                {STATUS[r.status] || r.status}
              </span>
              {r.status === "paid" && (
                <a href={`/invoice/${r.id}`}>
                  <button className="ghost" style={{ marginTop: 0 }}>Factura</button>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
