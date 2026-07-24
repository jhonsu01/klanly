"use client";

import { useEffect, useState } from "react";

type Me = { id: string; email: string; displayName: string; handle: string; role: string } | null;
type Community = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  priceCents: number;
  currency: string;
  billingPeriod: string;
};

async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json.data;
}

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

  // Community form
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cPrice, setCPrice] = useState("0");

  const refresh = async () => {
    try { setMe(await api("/auth/me")); } catch { setMe(null); }
    try { setCommunities(await api("/communities")); } catch {}
  };
  useEffect(() => { refresh(); }, []);

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

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

        {/* Crear comunidad */}
        <div className="card">
          <h2>Crear comunidad</h2>
          {me ? (
            <>
              <label>Nombre</label>
              <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Mi Comunidad" />
              <label>Descripción</label>
              <textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={2} placeholder="De qué trata…" />
              <label>Precio mensual (USD, 0 = gratis)</label>
              <input value={cPrice} onChange={(e) => setCPrice(e.target.value)} placeholder="0" />
              <button onClick={createCommunity} disabled={!cName}>Crear (me vuelve productor)</button>
            </>
          ) : (
            <div className="muted">Inicia sesión para crear una comunidad.</div>
          )}
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

      <div className="out">
        API activa: <code>/api/auth/*</code>, <code>/api/communities</code>, <code>/api/payments/*</code>, <code>/api/webhooks/wompi</code>.
        {" "}Fase F0 (auth + comunidades) y F1 (pagos Wompi + manual) listas.
      </div>
    </div>
  );
}
