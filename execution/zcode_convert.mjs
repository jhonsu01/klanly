#!/usr/bin/env node
/**
 * zcode_convert.mjs — delega a ZCode la conversión de UNA pantalla al sistema
 * visual Nocturno, sin que el contenido del archivo pase por el contexto de
 * Claude (que es justo el ahorro que se busca).
 *
 * Flujo:
 *   1. Lee el archivo objetivo y el bloque de tokens/primitivos de globals.css.
 *   2. Los manda a ZCode con instrucciones estrictas (solo código, sin prosa).
 *   3. Limpia vallas markdown, valida que sigue pareciendo el mismo módulo.
 *   4. Guarda un .bak y escribe el resultado.
 *   5. Imprime SOLO un informe compacto (líneas +/-, avisos).
 *
 * Uso:
 *   node execution/zcode_convert.mjs apps/web/src/app/pagos/page.tsx
 *   node execution/zcode_convert.mjs <archivo> --dry     (no escribe, solo informa)
 *
 * Después SIEMPRE validar:  cd apps/web && npx tsc --noEmit && npx next build
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---- entorno ----
try {
  const txt = readFileSync(new URL("./.env", import.meta.url), "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* sin .env */ }

const BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
const API_KEY = process.env.ZAI_API_KEY;
const MODEL = process.env.ZAI_MODEL || "glm-5.2";
// fileURLToPath decodifica bien los espacios de la ruta ("Jhon Supelano")
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const target = process.argv[2];
const dry = process.argv.includes("--dry");
if (!API_KEY) { console.error("Falta ZAI_API_KEY en execution/.env"); process.exit(2); }
if (!target) { console.error("Uso: node execution/zcode_convert.mjs <archivo> [--dry]"); process.exit(2); }

const abs = resolve(REPO, target);
if (!existsSync(abs)) { console.error("No existe: " + abs); process.exit(2); }

const original = readFileSync(abs, "utf8");

// Solo el catálogo de primitivos, no todo el CSS (ahorra tokens)
const css = readFileSync(resolve(REPO, "apps/web/src/app/globals.css"), "utf8");
const tokens = css.slice(0, css.indexOf("* { box-sizing"));
const primitives = [...css.matchAll(/^\.[a-z][\w-]*(?:[ .:>][^{]*)?\{[^}]*\}/gm)]
  .map((m) => m[0].split("{")[0].trim())
  .filter((s, i, a) => a.indexOf(s) === i)
  .join("  ");

const SYSTEM = `Eres ZCode, subagente de un equipo que mantiene Klanly (plataforma de
comunidades de pago). Tarea: migrar una pantalla React (Next.js App Router,
"use client") al sistema visual "Klanly Nocturno".

REGLAS DURAS
1. Devuelve EXCLUSIVAMENTE el contenido completo del archivo .tsx resultante.
   Sin explicaciones, sin \`\`\` , sin comentarios sobre lo que hiciste.
2. NO cambies la lógica: mismos hooks, mismo orden, mismas llamadas a api(),
   mismos nombres de estado, mismos handlers, mismos imports funcionales.
   Solo tocas presentación (className, style, textos de UI, estructura JSX
   mínima necesaria).
3. Reemplaza estilos inline ad-hoc por los primitivos del sistema cuando
   encajen. Usa var(--token), nunca hex crudos.
4. Micro-etiquetas y cifras SIEMPRE en la clase mono correspondiente
   (.label para rótulos en mayúsculas, .meta para metadatos, .figure para
   importes). Los importes de dinero van con .figure.
5. Estados (activo/en revisión/vencido/owner) con .pill / .pill.ok /
   .pill.bad / .pill.brand. Nunca inventes colores de estado.
6. Móvil: los botones de acción deben poder pulsarse (no reduzcas paddings);
   nada de anchos fijos que desborden 360px.
7. Mantén el español y las tildes. PROHIBIDO escribir la palabra "skool".
8. Conserva TopBar, toasts, ImageViewer, FilePicker y cualquier componente ya
   importado; no los sustituyas.`;

const user = `TOKENS DEL SISTEMA (globals.css):
${tokens}

CLASES DISPONIBLES (ya definidas en globals.css, úsalas, no las redefinas):
${primitives}

ARCHIVO A MIGRAR: ${target}
--- INICIO ARCHIVO ---
${original}
--- FIN ARCHIVO ---

Devuelve el archivo completo migrado.`;

const endpoint = BASE_URL.replace(/\/+$/, "") + "/chat/completions";
const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    temperature: 0.1,
    max_tokens: 32000,
  }),
});
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  process.exit(1);
}
const data = await res.json();
let out = data?.choices?.[0]?.message?.content ?? "";

// ---- limpieza: vallas markdown y prosa suelta ----
out = out.trim();
const fence = out.match(/```(?:tsx?|jsx?|typescript)?\n([\s\S]*?)```/);
if (fence) out = fence[1];
out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
if (!out.endsWith("\n")) out += "\n";

// ---- validaciones de cordura antes de sobreescribir ----
const problems = [];
if (!/^"use client"/m.test(out) && /^"use client"/m.test(original)) problems.push('perdió "use client"');
if (/skool/i.test(out)) problems.push('¡contiene la palabra prohibida "skool"!');
if (out.length < original.length * 0.5) problems.push(`sospechosamente corto (${out.length} vs ${original.length})`);
const expDefault = original.match(/export default function (\w+)/);
if (expDefault && !out.includes(expDefault[1])) problems.push(`perdió el componente ${expDefault[1]}`);
for (const h of ["useState", "useEffect", "api("]) {
  const a = (original.match(new RegExp(h.replace("(", "\\("), "g")) || []).length;
  const b = (out.match(new RegExp(h.replace("(", "\\("), "g")) || []).length;
  if (b < a) problems.push(`${h}: ${a} -> ${b} (perdió lógica)`);
}
if (/[#][0-9a-fA-F]{6}/.test(out.replace(/#(fff|000)\b/gi, ""))) {
  const hexes = [...new Set(out.match(/#[0-9a-fA-F]{6}/g) || [])];
  if (hexes.length) problems.push(`hex crudos restantes: ${hexes.slice(0, 5).join(" ")}`);
}

const oLines = original.split("\n").length;
const nLines = out.split("\n").length;
console.log(`archivo   : ${target}`);
console.log(`lineas    : ${oLines} -> ${nLines}`);
console.log(`tokens    : ${JSON.stringify(data.usage)}`);
console.log(`primitivos: ${[".label", ".meta", ".figure", ".pill", ".tabs", ".action-bar"].filter((c) => out.includes(c.slice(1))).join(" ") || "ninguno (revisar)"}`);
console.log(problems.length ? `AVISOS    : ${problems.join(" | ")}` : "AVISOS    : ninguno");

if (dry) { console.log("(--dry: no se escribio nada)"); process.exit(problems.length ? 1 : 0); }
if (problems.some((p) => p.includes("prohibida") || p.includes("perdió"))) {
  console.error("NO SE ESCRIBE: fallo una validacion critica.");
  process.exit(1);
}
copyFileSync(abs, abs + ".bak");
writeFileSync(abs, out, "utf8");
console.log(`escrito   : ${relative(REPO, abs)} (respaldo en .bak)`);
