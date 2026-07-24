"use client";

import { useCallback, useEffect, useState } from "react";
import { api, uploadFile } from "@/lib/api-client";

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

  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const prof: Profile = await api(`/users/${handle}`);
      setP(prof);
      setForm({ displayName: prof.displayName, bio: prof.bio || "", country: prof.country || "", avatarUrl: prof.avatarUrl || "" });
    } catch (e: any) { flash(e.message, false); }
    try { const me = await api(`/auth/me`); setMeHandle(me.handle); } catch { setMeHandle(null); }
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

  return (
    <div className="container">
      <a href="/" className="muted">← Todas las comunidades</a>
      {msg && <div className={`out ${msg.ok ? "ok" : "err"}`}>{msg.t}</div>}

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
              <input type="file" accept="image/*" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
              {form.avatarUrl && <img src={form.avatarUrl} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", marginTop: 8, display: "block" }} />}
              <button onClick={save} disabled={busy}>Guardar</button>
            </div>
          )}
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
