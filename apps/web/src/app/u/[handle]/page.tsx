"use client";

import { useCallback, useEffect, useState } from "react";
import { api, uploadFile } from "@/lib/api-client";
import FilePicker from "@/components/FilePicker";
import TopBar from "@/components/TopBar";
import ConfirmDanger from "@/components/ConfirmDanger";
import { askStepUp } from "@/lib/api-client";

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
  const [delOpen, setDelOpen] = useState(false);
  const [elig, setElig] = useState<{ canDelete: boolean; activeSubscribers: number; lastAccessUntil: string | null } | null>(null);

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const prof: Profile = await api(`/users/${handle}`);
      setP(prof);
      setForm({ displayName: prof.displayName, bio: prof.bio || "", country: prof.country || "", avatarUrl: prof.avatarUrl || "" });
    } catch (e: any) { flash(e.message, false); }
    try {
      const me = await api(`/auth/me`);
      setMeHandle(me.handle); setTwoFa(!!me.twoFactorEnabled);
      if (me.handle === handle) api(`/auth/delete-account`).then(setElig).catch(() => {});
    } catch { setMeHandle(null); }
  }, [handle]);
  useEffect(() => { load(); }, [load]);

  if (!p) return <div className="container"><TopBar backHref="/" /><p className="meta">Cargando…</p></div>;

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
  const askDelete = async () => {
    if (elig && !elig.canDelete) {
      const hasta = elig.lastAccessUntil ? new Date(elig.lastAccessUntil).toLocaleDateString() : "el vencimiento";
      flash(`Aún tienes ${elig.activeSubscribers} suscriptor(es) activos. Podrás eliminar tu cuenta desde ${hasta}.`, false);
      return;
    }
    setDelOpen(true);
  };
  const doDelete = async () => {
    try {
      setBusy(true);
      const code = await askStepUp("la eliminación de tu cuenta");
      if (!code) { setBusy(false); return; }
      await api(`/auth/delete-account`, "POST", { confirm: "confirmo", code });
      window.location.href = "/";
    } catch (e: any) { setBusy(false); setDelOpen(false); flash(e.message, false); }
  };
  const start2fa = async () => { try { setSetup(await api(`/auth/2fa/setup`, "POST")); } catch (e: any) { flash(e.message, false); } };
  const enable2fa = async () => { try { await api(`/auth/2fa/enable`, "POST", { secret: setup!.secret, code }); setSetup(null); setCode(""); setTwoFa(true); flash("2FA activado ✔"); } catch (e: any) { flash(e.message, false); } };
  const disable2fa = async () => { try { await api(`/auth/2fa/disable`, "POST", { code }); setCode(""); setTwoFa(false); flash("2FA desactivado"); } catch (e: any) { flash(e.message, false); } };

  return (
    <div className="container">
      <TopBar backHref="/" backLabel="Comunidades" />
      {msg && <div className={`toast ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

      <div className="brand" style={{ marginTop: 12, alignItems: "flex-start" }}>
        {p.avatarUrl
          ? <img src={p.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
          : <div className="logo" style={{ width: 64, height: 64, fontSize: 28 }}>{p.displayName.charAt(0).toUpperCase()}</div>}
        <div>
          <h1>{p.displayName}</h1>
          <div className="meta">@{p.handle}{p.country ? ` · ${p.country}` : ""} · desde {new Date(p.memberSince).toLocaleDateString()}</div>
          {p.bio && <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "var(--body)" }}>{p.bio}</p>}
        </div>
      </div>

      {isMe && (
        <div style={{ marginTop: 12 }}>
          <button className="ghost" style={{ marginTop: 0 }} onClick={() => setEdit((s) => !s)}>{edit ? "Cancelar" : "✏️ Editar perfil"}</button>
          {edit && (
            <div className="card" style={{ marginTop: 10 }}>
              <label className="label">Nombre</label>
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              <label className="label">Bio</label>
              <textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              <label className="label">País</label>
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              <label className="label">Avatar</label>
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
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2>Seguridad (2FA)</h2>
            <span className={`pill ${twoFa ? "ok" : ""}`}>{twoFa ? "Activo" : "Inactivo"}</span>
          </div>
          {!twoFa && !setup && <button onClick={start2fa}>Activar 2FA</button>}
          {!twoFa && setup && (
            <div style={{ marginTop: 10 }}>
              <div className="meta">1) En tu app (Google Authenticator / Authy) añade una cuenta manual con esta clave:</div>
              <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: ".06em", background: "var(--input)", border: "1px solid var(--border)", padding: "10px 12px", borderRadius: 10, margin: "8px 0", wordBreak: "break-all" }}>{setup.secret}</code>
              <div className="meta">2) Ingresa el código de 6 dígitos que muestra la app:</div>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} style={{ width: "100%", maxWidth: 140 }} />
              <div style={{ marginTop: 8 }}><button onClick={enable2fa} disabled={code.length !== 6}>Confirmar y activar</button></div>
            </div>
          )}
          {twoFa && (
            <div style={{ marginTop: 10 }}>
              <div className="meta">Para desactivarlo, ingresa un código actual de tu app:</div>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} style={{ width: "100%", maxWidth: 140 }} />
              <div style={{ marginTop: 8 }}><button className="ghost" onClick={disable2fa} disabled={code.length !== 6}>Desactivar 2FA</button></div>
            </div>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <a href="/afiliados" className="pact" style={{ marginTop: 0, display: "inline-block", textDecoration: "none" }}>💰 Mi panel de afiliado</a>
          </div>
        </div>
      )}

      {isMe && (
        <div className="card" style={{ marginTop: 16, borderColor: "var(--red)" }}>
          <h2 className="err">Zona de peligro</h2>
          <div className="meta">
            Eliminar tu cuenta borra tus datos personales de forma permanente. No hay vuelta atrás.
          </div>
          {elig && !elig.canDelete && (
            <div className="cd-warn" style={{ marginTop: 12 }}>
              Como productor no puedes eliminar tu cuenta todavía: tienes <b className="figure">{elig.activeSubscribers} suscriptor(es)</b> con
              acceso pagado vigente. Podrás hacerlo a partir del{" "}
              <b>{elig.lastAccessUntil ? new Date(elig.lastAccessUntil).toLocaleDateString() : "vencimiento"}</b>,
              cuando termine el periodo del último suscriptor.
            </div>
          )}
          <button
            className="cd-danger"
            style={{ marginTop: 12 }}
            onClick={askDelete}
            disabled={busy}
          >
            🗑 Eliminar mi cuenta
          </button>
        </div>
      )}

      {delOpen && (
        <ConfirmDanger
          title="Eliminar tu cuenta"
          detail="Vas a eliminar definitivamente tu cuenta de Klanly."
          bullets={[
            "Perderás el acceso a todas las comunidades en las que pagaste.",
            "Se borran tu perfil, avatar, bio y tu 2FA.",
            "Las comisiones de afiliado pendientes quedan anuladas.",
            "No se puede reactivar: tendrías que crear una cuenta nueva desde cero.",
          ]}
          actionLabel="Eliminar mi cuenta"
          busy={busy}
          onConfirm={doDelete}
          onCancel={() => setDelOpen(false)}
        />
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Comunidades ({p.communities.length})</h2>
        {p.communities.length === 0 && <div className="meta">Aún no pertenece a comunidades.</div>}
        {p.communities.map((c) => (
          <a href={`/c/${c.slug}`} key={c.slug} className="comm-item">
            <div className="comm-main">
              <div className="comm-name">{c.name}</div>
              <div className="meta">{c.role} · Nivel <span className="figure">{c.level}</span> · <span className="figure">{c.points}</span> pts</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
