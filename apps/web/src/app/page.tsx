"use client";

import { useEffect, useState } from "react";
import { api, uploadFile, money } from "@/lib/api-client";
import FilePicker from "@/components/FilePicker";

type Me = { id: string; email: string; displayName: string; handle: string; role: string; emailVerified?: boolean; producerStatus?: string; producerAccessUntil?: string | null } | null;
type Community = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  priceCents: number;
  currency: string;
  billingPeriod: string;
};
type Plan = { label: string; months: number; priceCents: number; currency: string };
type Account = { bank: string; number: string; name: string };

export default function Home() {
  const [me, setMe] = useState<Me>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  // Auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");

  // Community form
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cPrice, setCPrice] = useState("0");
  const [showCreate, setShowCreate] = useState(false);

  // Solicitud de productor
  const [plans, setPlans] = useState<Plan[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<Account[]>([]);
  const [selPlan, setSelPlan] = useState<number | null>(null);
  const [prodProof, setProdProof] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try { setMe(await api("/auth/me")); } catch { setMe(null); }
    try { setCommunities(await api("/communities")); } catch {}
  };
  useEffect(() => { refresh(); }, []);

  // Cargar planes cuando el usuario no es productor aprobado
  useEffect(() => {
    if (me && me.role !== "admin" && me.producerStatus !== "approved") {
      api("/producer/plans").then((d) => { setPlans(d.plans || []); setAdminAccounts(d.adminAccounts || []); }).catch(() => {});
    }
  }, [me]);

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };
  const uploadProof = async (file?: File) => {
    if (!file) return;
    try { setBusy(true); setProdProof(await uploadFile(file, "proofs")); flash("Comprobante subido ✔"); }
    catch (e: any) { flash(e.message, false); } finally { setBusy(false); }
  };

  const doRegister = async () => {
    try { await api("/auth/register", "POST", { email, password, displayName }); flash("Cuenta creada ✔"); refresh(); }
    catch (e: any) { flash(e.message, false); }
  };
  const doLogin = async () => {
    try {
      const r = await api("/auth/login", "POST", { email, password, code: code || undefined });
      if (r?.requires2fa) { setNeeds2fa(true); flash("Ingresa tu código de 2FA"); return; }
      setNeeds2fa(false); setCode(""); flash("Sesión iniciada ✔"); refresh();
    } catch (e: any) { flash(e.message, false); }
  };
  const doLogout = async () => { await api("/auth/logout", "POST"); flash("Sesión cerrada"); refresh(); };

  const createCommunity = async () => {
    try {
      await api("/communities", "POST", {
        name: cName,
        description: cDesc,
        priceCents: Math.round(parseFloat(cPrice || "0") * 100),
        billingPeriod: parseFloat(cPrice || "0") > 0 ? "month" : "free",
      });
      flash("Comunidad creada ✔"); setCName(""); setCDesc(""); setCPrice("0"); refresh();
    } catch (e: any) { flash(e.message, false); }
  };

  const applyProducer = async () => {
    if (!selPlan) { flash("Elige un plan", false); return; }
    try { await api("/producer/apply", "POST", { planMonths: selPlan, proofUrl: prodProof || undefined }); flash("Solicitud enviada. El admin verificará tu pago."); refresh(); }
    catch (e: any) { flash(e.message, false); }
  };
  const verifyEmail = async () => {
    try { await api("/auth/verify-email", "POST", { code: verifyCode }); setVerifyCode(""); flash("¡Cuenta verificada! ✔"); refresh(); }
    catch (e: any) { flash(e.message, false); }
  };
  const resendVerify = async () => {
    try { await api("/auth/resend-verification", "POST"); flash("Código reenviado a tu correo ✔"); }
    catch (e: any) { flash(e.message, false); }
  };

  const join = async (c: Community) => {
    try {
      const r = await api(`/communities/${c.slug}/join`, "POST");
      if (r.requiresPayment) flash(`Unido (pendiente de pago: ${(r.amountCents / 100).toFixed(2)} ${r.currency})`);
      else flash("Te uniste ✔");
      refresh();
    } catch (e: any) { flash(e.message, false); }
  };

  return (
    <div className="container">
      <div className="brand"><div className="logo">K</div><div><h1>Klanly</h1><div className="muted">Plataforma de comunidades de pago · MVP F0/F1</div></div></div>

      {msg && <div className={`out ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      {me && me.emailVerified === false && (
        <div className="card" style={{ marginTop: 16, borderColor: "var(--gold)" }}>
          <h2>✉️ Verifica tu correo</h2>
          <div className="muted">Te enviamos un código de 6 dígitos a <b>{me.email}</b>. Ingrésalo para activar tu cuenta (necesario para unirte, pagar o crear comunidades).</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="123456" maxLength={6} style={{ width: 140 }} />
            <button style={{ marginTop: 0 }} onClick={verifyEmail} disabled={verifyCode.length !== 6}>Verificar</button>
            <button className="ghost" style={{ marginTop: 0 }} onClick={resendVerify}>Reenviar código</button>
          </div>
        </div>
      )}

      <div className="grid">
        {/* Sesión */}
        <div className="card">
          <h2>Cuenta</h2>
          {me ? (
            <>
              <div className="muted">Conectado como</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>
                <a href={`/u/${me.handle}`} style={{ color: "var(--text)", textDecoration: "none" }}>{me.displayName}</a> <span className="pill">{me.role}</span>
              </div>
              <div className="muted">{me.email} · @{me.handle}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a href={`/u/${me.handle}`}><button className="ghost">Mi perfil</button></a>
                <a href="/pagos"><button className="ghost">Mis pagos</button></a>
                <a href="/afiliados"><button className="ghost">Afiliados</button></a>
                <button className="ghost" onClick={doLogout}>Cerrar sesión</button>
              </div>
            </>
          ) : (
            <>
              <label>Nombre (para registro)</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Tu nombre" />
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
              <label>Contraseña (mín. 8)</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              {needs2fa && (
                <>
                  <label>Código 2FA (6 dígitos)</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} />
                </>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={doRegister}>Registrarme</button>
                <button className="ghost" onClick={doLogin}>Entrar</button>
              </div>
            </>
          )}
        </div>

        {/* Crear comunidad (colapsable) */}
        <div className="card">
          <div onClick={() => setShowCreate((s) => !s)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <h2 style={{ margin: 0 }}>Publicar comunidad</h2>
            <span className="muted" style={{ fontSize: 13 }}>{showCreate ? "▾ ocultar" : "▸ soy productor"}</span>
          </div>
          {showCreate && <div style={{ marginTop: 12 }}>
          {!me ? (
            <div className="muted">Inicia sesión para crear una comunidad.</div>
          ) : (me.role === "admin" || me.producerStatus === "approved") ? (
            <>
              <label>Nombre</label>
              <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Mi Comunidad" />
              <label>Descripción</label>
              <textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={2} placeholder="De qué trata…" />
              <label>Precio mensual (USD, 0 = gratis)</label>
              <input value={cPrice} onChange={(e) => setCPrice(e.target.value)} placeholder="0" />
              <button onClick={createCommunity} disabled={!cName}>Crear comunidad</button>
            </>
          ) : me.producerStatus === "pending" ? (
            <div className="muted">Tu solicitud para ser <b>productor</b> está pendiente de aprobación del administrador.</div>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 8 }}>Para publicar comunidades, elige un plan de acceso, paga a una de las cuentas y sube tu comprobante. El administrador verifica y te aprueba.</div>
              <label>Plan de acceso</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {plans.length === 0 && <div className="muted">El administrador aún no configuró planes.</div>}
                {plans.map((p) => (
                  <button key={p.months} className={selPlan === p.months ? "" : "ghost"} style={{ marginTop: 0 }} onClick={() => setSelPlan(p.months)}>{p.label} · {money(p.priceCents, p.currency)}</button>
                ))}
              </div>
              {adminAccounts.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div className="muted">Paga a:</div>
                  {adminAccounts.map((a, i) => (
                    <div key={i} className="row" style={{ padding: "6px 0" }}>
                      <div><b>{a.bank}</b> · {a.number}<div className="muted">{a.name}</div></div>
                      <button className="ghost" style={{ marginTop: 0, fontSize: 12, padding: "4px 10px" }} onClick={() => { navigator.clipboard?.writeText(a.number); flash("Número copiado ✔"); }}>Copiar</button>
                    </div>
                  ))}
                </div>
              )}
              <label>Comprobante (imagen, opcional)</label>
              <FilePicker
                label="Adjuntar comprobante"
                hint="Foto o captura de la transferencia"
                value={prodProof || undefined}
                busy={busy}
                onPick={(f) => uploadProof(f)}
                onClear={() => setProdProof("")}
              />
              <button onClick={applyProducer} disabled={!selPlan || busy}>Enviar solicitud</button>
              {me.producerStatus === "rejected" && <div className="out err" style={{ marginTop: 8 }}>Tu solicitud anterior fue rechazada.</div>}
            </>
          )}
          </div>}
        </div>
      </div>

      {/* Listado */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Comunidades ({communities.length})</h2>
        {communities.length === 0 && <div className="muted">Aún no hay comunidades. Crea la primera arriba.</div>}
        {communities.map((c) => (
          <div className="row" key={c.id}>
            <div>
              <a href={`/c/${c.slug}`} style={{ fontSize: 15, textDecoration: "none", color: "var(--text)" }}>{c.name}</a>
              <div className="muted">
                {c.priceCents === 0 ? "Free" : `$${(c.priceCents / 100).toFixed(2)}/${c.billingPeriod}`} · /{c.slug}
              </div>
            </div>
            <a href={`/c/${c.slug}`}><button className="ghost" style={{ marginTop: 0 }}>Abrir →</button></a>
          </div>
        ))}
      </div>

      <footer style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border)", textAlign: "center" }}>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Klanly es un proyecto <b>open source</b> y gratuito. Si te sirve, apóyame con un café ☕</div>
        <a href="https://ko-fi.com/V7V81LV7GX" target="_blank" rel="noreferrer">
          <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Apóyame en Ko-fi" style={{ height: 36 }} />
        </a>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          <a href="https://github.com/jhonsu01/klanly" target="_blank" rel="noreferrer" style={{ color: "var(--muted)" }}>Código en GitHub</a>
        </div>
      </footer>
    </div>
  );
}
