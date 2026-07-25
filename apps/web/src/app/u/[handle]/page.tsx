"use client";

import { useCallback, useEffect, useState } from "react";
import { api, uploadFile } from "@/lib/api-client";
import FilePicker from "@/components/FilePicker";

type Com = { slug: string; name: string; role: string; level: number; points: number };
type Profile = {
  displayName: string; handle: string; bio?: string | null; avatarUrl?: string | null;
  country?: string | null; memberSince: string; communities: Com[];
};

export default function ProfilePage({ params }: { params: { handle: string } }) {
  const handle = params.handle;
  const [p, setP] = useState<Profile | null>(null);
  const [meHandle, setMeHandle] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ displayName: "", bio: "", country: "", avatarUrl: "" });
  const [busy, setBusy] = useState(false);
  const [twoFa, setTwoFa] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const prof: Profile = await api(`/users/${handle}`);
      setP(prof);
      setForm({ displayName: prof.displayName, bio: prof.bio || "", country: prof.country || "", avatarUrl: prof.avatarUrl || "" });
    } catch (e: any) { flash(e.message, false); }
    try { const me = await api(`/auth/me`); setMeHandle(me.handle); setTwoFa(!!me.twoFactorEnabled); } catch { setMeHandle(null); }
  }, [handle]);
  useEffect(() => { load(); }, [load]);

  if (!p) return <div className="container"><a href="/" className="muted">← Volver</a><p className="muted" style={{ marginTop: 20 }}>Cargando…</p></div>;

  const isMe = meHandle === p.handle;

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    try { setBusy(true); const url = await uploadFile(file, "avatars"); setForm((f) => ({ ...f, avatarUrl: url })); flash("Avatar subido ✔"); }
    catch (e: any) { flash(e.message, false); } finally { setBusy(false); }
  };
  const save = async () => {
    try {
      await api(`/auth/me`, "PATCH", { displayName: form.displayName, bio: form.bio, country: form.country || undefined, avatarUrl: form.avatarUrl || undefined });
      setEdit(false); flash("Perfil actualizado ✔"); load();
    } catch (e: any) { flash(e.message, false); }
  };
  const start2fa = async () => { try { setSetup(await api(`/auth/2fa/setup`, "POST")); } catch (e: any) { flash(e.message, false); } };
  const enable2fa = async () => { try { await api(`/auth/2fa/enable`, "POST", { secret: setup!.secret, code }); setSetup(null); setCode(""); setTwoFa(true); flash("2FA activado ✔"); } catch (e: any) { flash(e.message, false); } };
  const disable2fa = async () => { try { await api(`/auth/2fa/disable`, "POST", { code }); setCode(""); setTwoFa(false); flash("2FA desactivado"); } catch (e: any) { flash(e.message, false); } };

  return (
    <div className="container">
      <a href="/" className="muted">← Todas las comunidades</a>
      {msg && <div className={`toast ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      <div className="brand" style={{ marginTop: 12, alignItems: "flex-start" }}>
        {p.avatarUrl
          ? <img src={p.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
          : <div className="logo" style={{ width: 64, height: 64, fontSize: 28 }}>{p.displayName.charAt(0).toUpperCase()}</div>}
        <div>
          <h1>{p.displayName}</h1>
          <div className="muted">@{p.handle}{p.country ? ` · ${p.country}` : ""} · desde {new Date(p.memberSince).toLocaleDateString()}</div>
          {p.bio && <p style={{ marginTop: 8 }}>{p.bio}</p>}
        </div>
      </div>

      {isMe && (
        <div style={{ marginTop: 12 }}>
          <button className="ghost" style={{ marginTop: 0 }} onClick={() => setEdit((s) => !s)}>{edit ? "Cancelar" : "✏️ Editar perfil"}</button>
          {edit && (
            <div className="card" style={{ marginTop: 10 }}>
              <label>Nombre</label>
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              <label>Bio</label>
              <textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              <label>País</label>
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              <label>Avatar</label>
              <FilePicker
                label="Subir avatar"
                hint="Cuadrado se ve mejor"
                value={form.avatarUrl || undefined}
                busy={busy}
                onPick={(f) => uploadAvatar(f)}
                onClear={() => setForm((v) => ({ ...v, avatarUrl: "" }))}
              />
              <button onClick={save} disabled={busy}>Guardar</button>
            </div>
          )}
        </div>
      )}

      {isMe && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Seguridad (2FA)</h2>
            <span className="pill" style={{ color: twoFa ? "var(--green)" : "var(--muted)" }}>{twoFa ? "Activo" : "Inactivo"}</span>
          </div>
          {!twoFa && !setup && <button onClick={start2fa}>Activar 2FA</button>}
          {!twoFa && setup && (
            <div style={{ marginTop: 10 }}>
              <div className="muted">1) En tu app (Google Authenticator / Authy) añade una cuenta manual con esta clave:</div>
              <code style={{ display: "block", background: "var(--input)", padding: "8px 10px", borderRadius: 8, margin: "8px 0", wordBreak: "break-all" }}>{setup.secret}</code>
              <div className="muted">2) Ingresa el código de 6 dígitos que muestra la app:</div>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} style={{ width: 140 }} />
              <div><button onClick={enable2fa} disabled={code.length !== 6}>Confirmar y activar</button></div>
            </div>
          )}
          {twoFa && (
            <div style={{ marginTop: 10 }}>
              <div className="muted">Para desactivarlo, ingresa un código actual de tu app:</div>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} style={{ width: 140 }} />
              <div><button className="ghost" onClick={disable2fa} disabled={code.length !== 6}>Desactivar 2FA</button></div>
            </div>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <a href="/afiliados"><button className="ghost" style={{ marginTop: 0 }}>💰 Mi panel de afiliado</button></a>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Comunidades ({p.communities.length})</h2>
        {p.communities.length === 0 && <div className="muted">Aún no pertenece a comunidades.</div>}
        {p.communities.map((c) => (
          <div className="row" key={c.slug}>
            <a href={`/c/${c.slug}`} style={{ color: "var(--text)", textDecoration: "none" }}>{c.name}</a>
            <div className="muted">{c.role} · Nv {c.level} · {c.points} pts</div>
          </div>
        ))}
      </div>
    </div>
  );
}
