# ZCode (GLM-5.2) como subagente de apoyo para Claude

> Guía de delegación. ZCode es una sesión secundaria que Claude puede usar para
> delegar subtareas de código y ser más eficiente. Pensado para cuando Claude
> (principal) quiera paralelizar trabajo "mecánico" y reservar su tiempo para
> diseño (DesignSync) y deploy (Vercel).

## Modelo de colaboración

```
┌───────────────────────────┐    delega subtarea     ┌──────────────────────────┐
│  Claude Code (principal)  │ ─────────────────────▶ │   ZCode / GLM-5.2        │
│  · suscripción            │                        │   (subagente de apoyo)   │
│  · DesignSync (diseño)    │ ◀───────────────────── │   · filesystem + edits   │
│  · conector Vercel        │    código / respuesta   │   · web, SSH/SFTP        │
│  · decide + integra       │                        │   · browser IAB + node   │
└───────────────────────────┘                        │   · android-emulator     │
                                                     └──────────────────────────┘
```

- **Claude** queda como orquestador: importa el diseño, decide la arquitectura,
  desploiega en Vercel, integra lo que devuelve ZCode.
- **ZCode** ejecuta lo repetitivo/mecánico: convertir pantallas al sistema
  Nocturno, boilerplate, scripts, tests, edits puntuales, validación local.

## Cómo invocarlo (puente por API)

El usuario puso el endpoint fijo de Z.ai; **él carga la key** (no va en el repo).

| Variable de entorno | Valor | quién la pone |
|---|---|---|
| `ZAI_BASE_URL` | `https://api.z.ai/api/coding/paas/v4` | fija (ya en `.env.example`) |
| `ZAI_API_KEY` | *(la key de Z.ai del usuario)* | **el usuario** |
| `ZAI_MODEL` | `glm-5.2` *(o el modelo coding que toque)* | ajustable |

Script puente: **`execution/zai_delegate.mjs`** (Node, sin dependencias, usa
`fetch` global). Ejemplos:

```bash
# 1) Cargar la key (el usuario la exporta en su shell o la pone en execution/.env)
export ZAI_API_KEY="..."

# 2) Delegar una subtarea concreta
node execution/zai_delegate.mjs "Convierte apps/web/src/app/pagos/page.tsx al \
sistema Nocturno usando los primitivos de globals.css (.label, .meta, .figure, \
.pill, .tabs). Referencia: apps/web/src/app/c/[slug]/page.tsx. No romper la \
lógica. Devuelve solo el diff."

# 3) O por stdin (para prompts largos / con código)
cat .tmp/tarea.md | node execution/zai_delegate.mai
```

> **Nota sobre el payload:** el script envía una petición estilo chat
> (OpenAI-compatible) al endpoint. Si la API Z.ai de coding usa otro formato
> (p. ej. `messages` estilo Anthropic u otro nombre de campo), basta con
> ajustar el `body` en `zai_delegate.mjs` — la cabecera del script lo deja
> marcado. El endpoint y la auth (Bearer) son los correctos.

### Modo alternativo (sin API)
El usuario abre ZCode en paralelo y le pega la subtarea. ZCode trabaja el repo
directamente (mismo `skoolclone/`, misma memoria). Útil cuando se quiere
interactivo o la key aún no está.

## Qué delegar a ZCode (lo hace bien)

- **Convertir pantallas web a Nocturno.** Sistema ya materializado en
  `apps/web/src/app/globals.css` (tokens + primitivos: `.label`, `.meta`,
  `.figure`, `.pill`, `.tabs/.tab`, `.ring`, `.meter`, `.bottomnav`,
  `.action-bar`, `.steps`, `.sheet`, `.post`, `.pact`). Referencia de uso:
  `apps/web/src/app/c/[slug]/page.tsx`. **Ya hizo `page.tsx` (home).**
- Boilerplate, scripts en `execution/`, tests de `apps/web/src/lib/*`.
- Edits con `Edit`/`Write` y validación: `cd apps/web && npm run dev` +
  snapshot de DOM con el browser IAB (la estructura, no la imagen).
- SSH/SFTP al servidor linux (MCP `servidor-linux`) si se necesita.

## Qué NO delegar (se queda en Claude)

- **Importar diseños** de claude.ai/design → lo hace Claude con **DesignSync**
  (ZCode no tiene ese MCP).
- **Deploy / logs / errores en runtime** de Vercel → conector Vercel de Claude
  (ZCode no lo tiene).
- **QA visual fina de diseño:** las capturas del browser IAB se muestran en el
  panel del usuario pero **no le llegan a ZCode como imagen**. ZCode valida por
  DOM + compilación. El veredicto visual final lo da el usuario.

## Memoria (canal de handoff entre sesiones)

- **Claude:** `C:\Users\Jhon Supelano\.claude\projects\C--Users-Jhon-Supelano-Downloads-Skool\memory\`
  — `klanly-project.md` (contexto fino) y `zcode-subagent.md` (este rol).
- **ZCode:** `C:\Users\Jhon Supelano\.zcode\cli\memories\projects\skool-b2abb1912d7f5e7f\memory\`
  — `MEMORY.md` índice + `klanly-overview`, `klanly-pending`, `klanly-session-role`,
  `klanly-gotchas`.

Ambas sesiones escriben/leen el mismo repo (`skoolclone/`), así que el código
es el punto de sincronía principal.

## Estado al crear este doc (2026-08-12)

- Versión: v0.6.0. Rediseño Nocturno: tokens + primitivos + página de comunidad
  commiteados y en vivo (Claude). Resto de pantallas pendientes de convertir.
- **Cambios sin commitear hechos por ZCode** (decidir: commitear/pushear o revertir):
  1. APK nativo Nocturno: `apps/android/.../values/colors.xml`, `themes.xml`,
     `AndroidManifest.xml` (theme → `Theme.Klanly.Nocturno`).
  2. Home Nocturno: `apps/web/src/app/page.tsx` + `globals.css` (bloque `.comm-*`).
- ZCode **no commitea ni pushea** sin orden explícita del usuario.
