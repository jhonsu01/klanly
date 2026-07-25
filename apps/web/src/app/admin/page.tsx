"use client";

import { useCallback, useEffect, useState } from "react";
import { api, money, askStepUp } from "@/lib/api-client";
import ImageViewer from "@/components/ImageViewer";

type Me = { handle: string; role: string; displayName?: string; email?: string; twoFactorEnabled?: boolean } | null;
type Overview = { communities: number; users: number; pendingProducers: number; pendingProofs: number; pendingPayouts: number; grossRevenueCents: number };
type Producer = { id: string; displayName: string; email: string; handle: string; producerStatus: string; planMonths?: number; proofUrl?: string; accessUntil?: string };
type Account = { bank: string; number: string; name: string };
type Plan = { label: string; months: number; priceCents: number; currency: string };
type Proof = { id: string; amountCents: number; currency: string; proofUrl?: string; userEmail: string; communityName: string };
type Payout = { id: string; amountCents: number; currency: string; method?: string; status: string; payeeName: string; payeeEmail: string; communityName?: string };
type Com = { id: string; slug: string; name: string; priceCents: number; currency: string; isPublic: boolean; ownerName: string; ownerEmail: string; members: number; revenueCents: number };
type Audit = { id: number; action: string; entity?: string; entityId?: string; createdAt: string; actorName?: string };

type Section = "overview" | "producers" | "proofs" | "payouts" | "communities" | "billing" | "audit" | "settings";

export default function AdminPage() {
  const [me, setMe] = useState<Me>(null);
  const [ready, setReady] = useState(false);
  const [sec, setSec] = useState<Section>("overview");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const [ov, setOv] = useState<Overview | null>(null);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [coms, setComs] = useState<Com[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [pwd, setPwd] = useState({ current: "", next: "" });

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => { (async () => { try { setMe(await api(`/auth/me`)); } catch { setMe(null); } setReady(true); })(); }, []);

  const refresh = useCallback(async () => {
    setOv(await api(`/admin/overview`).catch(() => null));
    setProducers(await api(`/admin/producers`).catch(() => []));
    setProofs(await api(`/admin/payments/pending`).catch(() => []));
    setPayouts(await api(`/admin/payouts`).catch(() => []));
    setComs(await api(`/admin/communities`).catch(() => []));
    setAudit(await api(`/admin/audit`).catch(() => []));
    const s = await api(`/admin/settings`).catch(() => null);
    if (s) { setAccounts(s.adminAccounts || []); setPlans(s.producerPlans || []); }
  }, []);
  useEffect(() => { if (me?.role === "admin") refresh(); }, [me, sec, refresh]);

  if (!ready) return <div className="container"><p className="muted">Cargando…</p></div>;
  if (!me) return <div className="container"><div className="brand"><div className="logo">K</div><h1>Klanly Admin</h1></div><div className="card" style={{ marginTop: 16 }}><div className="muted">Inicia sesión con tu cuenta de administrador.</div><a href="/"><button style={{ marginTop: 10 }}>Ir a iniciar sesión</button></a></div></div>;
  if (me.role !== "admin") return <div className="container"><div className="card" style={{ marginTop: 16 }}><div className="err">Acceso restringido: solo el super administrador.</div><a href="/"><button className="ghost" style={{ marginTop: 12 }}>← Volver al inicio</button></a></div></div>;

  const reviewProducer = async (id: string, d: "approve" | "reject") => { try { await api(`/admin/producers/${id}`, "PATCH", { decision: d }); flash(d === "approve" ? "Productor aprobado ✔" : "Rechazado"); refresh(); } catch (e: any) { flash(e.message, false); } };
  const reviewProof = async (id: string, d: "approve" | "reject") => { try { await api(`/payments/orders/${id}/review`, "POST", { decision: d }); flash(d === "approve" ? "Aprobado ✔" : "Rechazado"); refresh(); } catch (e: any) { flash(e.message, false); } };
  const reviewPayout = async (id: string, d: "approve" | "reject") => { try { await api(`/payouts/${id}`, "PATCH", { decision: d }); flash(d === "approve" ? "Payout pagado ✔" : "Rechazado"); refresh(); } catch (e: any) { flash(e.message, false); } };
  const saveSettings = async () => {
    try {
      const stepCode = await askStepUp("los cambios en cuentas y planes de cobro");
      if (!stepCode) return;
      await api(`/admin/settings`, "POST", { adminAccounts: accounts.filter((a) => a.bank || a.number || a.name), producerPlans: plans, code: stepCode });
      flash("Configuración guardada ✔");
    } catch (e: any) { flash(e.message, false); }
  };
  const start2fa = async () => { try { setTwoFaSetup(await api(`/auth/2fa/setup`, "POST")); } catch (e: any) { flash(e.message, false); } };
  const enable2fa = async () => { try { await api(`/auth/2fa/enable`, "POST", { secret: twoFaSetup!.secret, code }); setTwoFaSetup(null); setCode(""); setMe({ ...me!, twoFactorEnabled: true }); flash("2FA activado ✔"); } catch (e: any) { flash(e.message, false); } };
  const disable2fa = async () => { try { await api(`/auth/2fa/disable`, "POST", { code }); setCode(""); setMe({ ...me!, twoFactorEnabled: false }); flash("2FA desactivado"); } catch (e: any) { flash(e.message, false); } };
  const changePwd = async () => {
    try {
      if (!pwd.current || pwd.next.length < 8) { flash("La nueva contraseña debe tener 8+ caracteres", false); return; }
      const stepCode = await askStepUp("el cambio de contraseña");
      if (!stepCode) return;
      await api(`/auth/change-password`, "POST", { currentPassword: pwd.current, newPassword: pwd.next, code: stepCode });
      setPwd({ current: "", next: "" });
      flash("Contraseña actualizada ✔");
    } catch (e: any) { flash(e.message, false); }
  };
  const logout = async () => { await api(`/auth/logout`, "POST").catch(() => {}); window.location.href = "/"; };

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
      {viewer && <ImageViewer src={viewer} onClose={() => setViewer(null)} />}
      <aside className="admin-side">
        <div className="brand" style={{ padding: "0 6px 18px" }}><div className="logo">K</div><div><b>Klanly</b><div className="muted" style={{ fontSize: 11 }}>Admin Console</div></div></div>
        <nav className="admin-nav">
          <Item id="overview" icon="📊" label="Overview" />
          <Item id="producers" icon="🎬" label="Productores" badge={pendingProducers.length} />
          <Item id="proofs" icon="🧾" label="Comprobantes" badge={proofs.length} />
          <Item id="payouts" icon="💸" label="Payouts" badge={reqPayouts.length} />
          <Item id="communities" icon="👥" label="Comunidades" />
          <Item id="billing" icon="🏦" label="Cobros a productores" />
          <Item id="audit" icon="🔎" label="Auditoría" />
          <Item id="settings" icon="⚙️" label="Ajustes" />
        </nav>
        <div style={{ marginTop: 24, padding: "0 10px", textAlign: "center", overflow: "hidden" }}>
          <a href="https://ko-fi.com/V7V81LV7GX" target="_blank" rel="noreferrer" style={{ display: "block" }}>
            <img className="kofi" src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Apóyame en Ko-fi" />
          </a>
        </div>
      </aside>

      <main className="admin-main">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>Panel de administración</h1>
            <div className="muted" style={{ marginBottom: 20 }}>Supervisión global de la plataforma · cobros manuales, afiliados y liquidaciones</div>
          </div>
          <button className="ghost" style={{ marginTop: 0 }} onClick={refresh}>↻ Actualizar</button>
        </div>
        {msg && <div className={`toast ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

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
              <div className="proof-row" key={p.id}>
                {p.proofUrl
                  ? <img className="proof-thumb" src={p.proofUrl} alt="comprobante" title="Ver en grande" onClick={() => setViewer(p.proofUrl!)} />
                  : <div style={{ height: 56, width: 56, borderRadius: 8, border: "1px dashed var(--border)", display: "grid", placeItems: "center", fontSize: 10, color: "var(--muted)" }}>sin img</div>}
                <div className="proof-info">
                  <a href={`/u/${p.handle}`} style={{ color: "var(--text)", textDecoration: "none" }}>{p.displayName}</a>
                  <div className="muted">{p.email}{p.planMonths ? ` · plan ${p.planMonths} mes(es)` : ""}</div>
                </div>
                <div className="proof-actions">
                  {p.proofUrl && <button className="ghost" onClick={() => setViewer(p.proofUrl!)}>🔍 Ver</button>}
                  <button style={{ background: "var(--green)", color: "#04231a" }} onClick={() => reviewProducer(p.id, "approve")}>Aprobar</button>
                  <button className="ghost" onClick={() => reviewProducer(p.id, "reject")}>Rechazar</button>
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
              <div className="proof-row" key={o.id}>
                {o.proofUrl
                  ? <img className="proof-thumb" src={o.proofUrl} alt="comprobante" title="Ver en grande" onClick={() => setViewer(o.proofUrl!)} />
                  : <div style={{ height: 56, width: 56, borderRadius: 8, border: "1px dashed var(--border)", display: "grid", placeItems: "center", fontSize: 10, color: "var(--muted)" }}>sin img</div>}
                <div className="proof-info">
                  {o.userEmail}
                  <div className="muted">{o.communityName} · {money(o.amountCents, o.currency)}</div>
                </div>
                <div className="proof-actions">
                  {o.proofUrl && <button className="ghost" onClick={() => setViewer(o.proofUrl!)}>🔍 Ver</button>}
                  <button style={{ background: "var(--green)", color: "#04231a" }} onClick={() => reviewProof(o.id, "approve")}>Aprobar</button>
                  <button className="ghost" onClick={() => reviewProof(o.id, "reject")}>Rechazar</button>
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

        {sec === "billing" && (
          <div className="card">
            <h2>Cobros a productores</h2>
            <div className="muted" style={{ marginBottom: 12 }}>Configura tus cuentas (donde pagan los productores) y los planes de acceso. Estos datos se muestran al usuario cuando solicita ser productor.</div>

            <h2 style={{ fontSize: 15 }}>Tus cuentas de pago (máx 8)</h2>
            {accounts.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input style={{ flex: 1, minWidth: 90 }} placeholder="Banco (Nequi, BreB…)" value={a.bank} onChange={(e) => setAccounts(accounts.map((x, j) => j === i ? { ...x, bank: e.target.value } : x))} />
                <input style={{ flex: 1, minWidth: 90 }} placeholder="Número / llave" value={a.number} onChange={(e) => setAccounts(accounts.map((x, j) => j === i ? { ...x, number: e.target.value } : x))} />
                <input style={{ flex: 1, minWidth: 90 }} placeholder="Titular" value={a.name} onChange={(e) => setAccounts(accounts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <button className="ghost" style={{ marginTop: 0, color: "#ffb4c4" }} onClick={() => setAccounts(accounts.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {accounts.length < 8 && <button className="ghost" style={{ marginTop: 0 }} onClick={() => setAccounts([...accounts, { bank: "", number: "", name: "" }])}>+ Agregar cuenta</button>}

            <h2 style={{ fontSize: 15, marginTop: 18 }}>Planes de acceso</h2>
            {plans.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input style={{ flex: 1, minWidth: 80 }} placeholder="Etiqueta (1 mes)" value={p.label} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <input style={{ width: 80 }} type="number" placeholder="Meses" value={p.months} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, months: parseInt(e.target.value || "1", 10) } : x))} />
                <input style={{ width: 100 }} type="number" placeholder="Precio" value={(p.priceCents / 100).toString()} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, priceCents: Math.round(parseFloat(e.target.value || "0") * 100) } : x))} />
                <select style={{ width: 80 }} value={p.currency} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, currency: e.target.value } : x))}>
                  <option value="USD">USD</option>
                  <option value="COP">COP</option>
                </select>
                <button className="ghost" style={{ marginTop: 0, color: "#ffb4c4" }} onClick={() => setPlans(plans.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {plans.length < 8 && <button className="ghost" style={{ marginTop: 0 }} onClick={() => setPlans([...plans, { label: "", months: 1, priceCents: 0, currency: "USD" }])}>+ Agregar plan</button>}

            <div><button onClick={saveSettings}>Guardar configuración</button></div>
          </div>
        )}

        {sec === "settings" && (
          <>
            <div className="card">
              <h2>Cuenta</h2>
              <div className="row"><div className="muted">Nombre</div><div>{me.displayName}</div></div>
              <div className="row"><div className="muted">Email</div><div>{me.email}</div></div>
              <div className="row"><div className="muted">Rol</div><span className="pill" style={{ color: "var(--accent2)" }}>super admin</span></div>
              <button className="ghost" onClick={logout}>Cerrar sesión</button>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>Seguridad (2FA)</h2>
                <span className="pill" style={{ color: me.twoFactorEnabled ? "var(--green)" : "var(--muted)" }}>{me.twoFactorEnabled ? "Activo" : "Inactivo"}</span>
              </div>
              {!me.twoFactorEnabled && !twoFaSetup && <button onClick={start2fa}>Activar 2FA</button>}
              {!me.twoFactorEnabled && twoFaSetup && (
                <div style={{ marginTop: 10 }}>
                  <div className="muted">Añade esta clave en Google Authenticator/Authy:</div>
                  <code style={{ display: "block", background: "var(--input)", padding: "8px 10px", borderRadius: 8, margin: "8px 0", wordBreak: "break-all" }}>{twoFaSetup.secret}</code>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de 6 dígitos" maxLength={6} style={{ width: 160 }} />
                  <div><button onClick={enable2fa} disabled={code.length !== 6}>Confirmar y activar</button></div>
                </div>
              )}
              {me.twoFactorEnabled && (
                <div style={{ marginTop: 10 }}>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código actual" maxLength={6} style={{ width: 160 }} />
                  <div><button className="ghost" onClick={disable2fa} disabled={code.length !== 6}>Desactivar 2FA</button></div>
                </div>
              )}
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <h2>Cambiar contraseña</h2>
              <label>Contraseña actual</label>
              <input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
              <label>Nueva contraseña (mín. 8)</label>
              <input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
              <button onClick={changePwd} disabled={!pwd.current || pwd.next.length < 8}>Actualizar contraseña</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
