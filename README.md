<div align="center">

# Klanly

<div align="center">
  <img src="./assets/banner.png" alt="klanly  Banner" width="100%" />
  </div>

**Plataforma de comunidades de pago** — con apps instalables (`.msi` Windows + `.apk` Android), app web en Vercel y cobros duales (pasarela + comprobante manual).

[![Release](https://github.com/jhonsu01/klanly/actions/workflows/release.yml/badge.svg)](https://github.com/jhonsu01/klanly/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/jhonsu01/klanly?display_name=tag)](https://github.com/jhonsu01/klanly/releases/latest)

Proyecto **open source** y gratuito. Si te sirve, apóyame:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V81LV7GX)

</div>

---

## Descargar (última versión)

Los binarios se compilan automáticamente con GitHub Actions y se publican en **[Releases](https://github.com/jhonsu01/klanly/releases/latest)**:

| Plataforma | Archivo | Notas |
| --- | --- | --- |
| 🪟 **Windows** (admin) | `Klanly-Admin-vX.Y.Z.msi` | Panel de escritorio (Tauri). |
| 🤖 **Android** (usuario) | `Klanly-vX.Y.Z.apk` | Instalable habilitando "orígenes desconocidos". |

> Solo se mantiene la **última** release; las anteriores se eliminan automáticamente en cada nueva versión.

---

## Roles

| Rol | App | Alcance |
| --- | --- | --- |
| **Admin de plataforma** | `.msi` / `.apk` admin | Supervisión global, aprueba comprobantes y payouts. |
| **Productor** | Web / `.apk` productor | Crea comunidad, cobra, gestiona cursos y miembros. |
| **Usuario** | Web / `.apk` usuario | Paga membresía, participa, aprende, sube de nivel. |

---

## Estructura del monorepo

```
klanly/
├── apps/
│   ├── web/             # Next.js -> Vercel (web + API: auth, comunidades, pagos)
│   ├── admin-windows/   # Tauri v2 -> .msi (panel de escritorio del admin)
│   └── android/         # App Android (Kotlin + WebView) -> .apk
├── scripts/
│   ├── gen_icons.py     # Genera iconos multi-densidad (escritorio + Android)
│   └── release.ps1      # Sube versión, crea tag y dispara la Release
├── docs/
│   └── guia.md          # Plan técnico completo de la plataforma
├── .github/workflows/
│   └── release.yml      # CI: compila .msi + .apk, publica y limpia releases
└── VERSION
```

> **Fase F0/F1 lista** en `apps/web`: registro/login (JWT), gestión de comunidades y
> usuarios, y módulo de pagos (Wompi + comprobante manual + webhook). Ver
> [`apps/web/README.md`](apps/web/README.md). Faltan Classroom, gamificación y apps de productor.

---

## Compilar localmente

**MSI (requiere Rust + Node):**
```bash
cd apps/admin-windows
npm install
npx tauri build      # -> src-tauri/target/release/bundle/msi/*.msi
```

**APK (requiere JDK 17 + Android SDK):**
```bash
cd apps/android
./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
```

**Regenerar iconos:**
```bash
python scripts/gen_icons.py
```

---

## Publicar una nueva versión

```powershell
./scripts/release.ps1 -Version 0.2.0
```

Esto actualiza la versión en todos los manifiestos, crea el tag `v0.2.0` y lo empuja.
GitHub Actions compila los binarios, publica la Release y borra la anterior.

---

## Apoyo ☕

Klanly es gratuito y open source. Si te resulta útil, puedes apoyar su desarrollo:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V81LV7GX)

---

## Licencia

[MIT](LICENSE) © 2026 jhonsu01
