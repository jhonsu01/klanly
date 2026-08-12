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

## Cómo invocarlo (puente por API) — FUNCIONANDO

La key vive en `execution/.env` (ignorado por git). `execution/.env.example`
documenta las variables.

| Variable | Valor |
|---|---|
| `ZAI_BASE_URL` | `https://api.z.ai/api/coding/paas/v4` |
| `ZAI_API_KEY` | la key del usuario (**no va al repo**) |
| `ZAI_MODEL` | `glm-5.2` |

> **Gotcha resuelto:** hay que postear a `<BASE_URL>/chat/completions`.
> Posteando a la base devuelve `404 {"path":"/v4"}`.
>
> **Ojo con la autoidentificación:** preguntado "qué modelo eres" responde
> *"Claude 3.5 Sonnet"*. Es alucinación: el campo `model` de la respuesta de la
> API dice `glm-5.2`. Fía del campo, no de lo que diga el modelo.

### 1) Pregunta suelta / código corto

```bash
node execution/zai_delegate.mjs "<tarea>"
cat .tmp/tarea.md | node execution/zai_delegate.mjs
```

### 2) Convertir una pantalla al sistema Nocturno (el caso rentable)

```bash
node execution/zcode_convert.mjs apps/web/src/app/pagos/page.tsx --dry   # informe
node execution/zcode_convert.mjs apps/web/src/app/pagos/page.tsx         # escribe + .bak
```

**Por qué ahorra contexto:** el script lee el archivo, lo manda con los tokens y
el catálogo de clases, y escribe el resultado en disco. El contenido del archivo
**nunca entra al contexto del orquestador**: solo se imprime un informe de 5
líneas. Coste real medido: 6k–27k tokens del lado de ZCode por pantalla.

Validaciones automáticas antes de sobreescribir (aborta si fallan): conserva
`"use client"`, conserva el componente exportado, no baja el conteo de
`useState` / `useEffect` / `api(`, no deja hex crudos, no escribe la palabra
prohibida, y no acorta el archivo a menos de la mitad.

### Después de delegar, SIEMPRE

```bash
cd apps/web && npx tsc --noEmit && npx next build
```

Y revisar con el navegador que no haya **clases inexistentes** (el modelo se las
inventa o usa las que no tocan):

```js
// en la consola del navegador
const used=[...document.querySelectorAll('[class]')].flatMap(e=>[...e.classList]);
const def=new Set(); for(const ss of document.styleSheets){try{for(const r of ss.cssRules){
  const m=(r.selectorText||'').match(/\.[a-zA-Z][\w-]*/g); if(m)m.forEach(x=>def.add(x.slice(1)));}}catch{}}
[...new Set(used.filter(c=>!def.has(c)&&!c.startsWith('__')))]
```

### Errores reales que cometió (revisar SIEMPRE estos)

| Puso | Debía poner | Por qué |
|---|---|---|
| `.out` en botones | `.ghost` | `.out` es la clase de mensajes |
| `.figure` en el secreto 2FA | mono normal | `.figure` es 24px dorado, para importes |
| `.meta` en la bio del perfil | texto de lectura | `.meta` es mono 11px, para metadatos |
| `.pact` en "Imprimir" | `.ghost` | `.pact` es de acciones de post |
| `TopBar` dentro de un flex | prop `right` del TopBar | la barra es fija y a sangre |
| `.pill.bad` en "pendiente" | `.pill` (dorado) | rojo = vencido, no pendiente |

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

## Estado (2026-08-12, tras la primera delegación real)

- Versión: v0.6.0. **Rediseño Nocturno completo y en vivo**: tokens, primitivos,
  comunidad, home, pagos, factura, afiliados, perfil y Classroom. Commiteado y
  pusheado (Vercel despliega solo).
- `/admin` queda **deliberadamente sin migrar**: es el que carga la app de
  escritorio y el usuario pidió no tocarla.
- Android nativo: `Theme.Klanly.Nocturno` commiteado. **Necesita recompilar el
  APK** para verse (quita el destello blanco al arrancar).
- **CI de GitHub Actions desactivado** (limite de minutos superado): los
  binarios se compilan en local con `scripts/build-apk.ps1`. Ver
  `scripts/build-local.md`. Recordar: los cambios de web NO necesitan APK nuevo.
- ZCode **no commitea ni pushea** sin orden explícita del usuario.

## Pendiente de delegar (buenos candidatos)

- Tests de `apps/web/src/lib/*` (markdown.ts, image.ts, api-client.ts).
- Landing pública (opción `1g` del diseño) — aún no existe como pantalla.
- Cámara directa en el APK (FileProvider + ACTION_IMAGE_CAPTURE).
