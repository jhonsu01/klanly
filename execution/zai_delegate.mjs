#!/usr/bin/env node
/**
 * zai_delegate.mjs — puente para que Claude Code delegue subtareas a ZCode (GLM-5.2).
 *
 * Lee la key y el endpoint de entorno (o de execution/.env) y hace un POST al
 * endpoint de coding de Z.ai. Sin dependencias: usa fetch global (Node >= 18).
 *
 * Uso:
 *   export ZAI_API_KEY="..."                       # la pone el usuario
 *   node execution/zai_delegate.mjs "<tarea>"      # prompt como argumento
 *   echo "<tarea>" | node execution/zai_delegate.mjs   # o por stdin
 *
 * Variables (ver execution/.env.example):
 *   ZAI_BASE_URL  por defecto https://api.z.ai/api/coding/paas/v4  (fijo)
 *   ZAI_API_KEY   la key de Z.ai del usuario                       (requerida)
 *   ZAI_MODEL     modelo coding (p. ej. glm-5.2)                   (ajustable)
 *
 * PAYLOAD: se envía una petición estilo chat (formato OpenAI-compatible:
 * { model, messages, temperature }). Si la API Z.ai de coding espera otro
 * esquema (mensajes estilo Anthropic, etc.), basta con ajustar `body` más
 * abajo y/o el parseo de la respuesta. El endpoint y la auth (Bearer) son los
 * que fijó el usuario.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

// ---- cargar execution/.env si existe (no sobreescribe vars del shell) ----
try {
  const envPath = new URL("./.env", import.meta.url);
  const txt = readFileSync(envPath, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch { /* no hay .env, se usan las vars del shell */ }

const BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
const API_KEY = process.env.ZAI_API_KEY;
const MODEL = process.env.ZAI_MODEL || "glm-5.2";

async function readStdin() {
  const rl = createInterface({ input: process.stdin });
  const lines = [];
  for await (const line of rl) lines.push(line);
  return lines.join("\n");
}

async function main() {
  if (!API_KEY) {
    console.error(
      "[zai_delegate] Falta ZAI_API_KEY. Ponla en execution/.env o en el shell.\n" +
      "  Endpoint fijado por el usuario: " + BASE_URL,
    );
    process.exit(2);
  }

  let task = process.argv.slice(2).join(" ").trim();
  if (!task && !process.stdin.isTTY) task = (await readStdin()).trim();
  if (!task) {
    console.error("[zai_delegate] No se recibió tarea. Pásala como argumento o por stdin.");
    process.exit(2);
  }

  const system =
    "Eres ZCode, subagente de apoyo de Claude Code para el proyecto Klanly " +
    "(plataforma de comunidades de pago, repo en skoolclone/). Responde la " +
    "subtarea con código concretamente y sin relleno. Usa el sistema visual " +
    "Nocturno de apps/web/src/app/globals.css como referencia. PROHIBIDO " +
    "mencionar la palabra 'skool'. Devuelve solo lo pedido (diff o código).";

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: task },
    ],
    temperature: 0.2,
    stream: false,
  };

  // La base es .../paas/v4; el recurso de chat es /chat/completions.
  // (Postear a la base devuelve 404 "path: /v4".)
  const endpoint = /\/chat\/completions\/?$/.test(BASE_URL)
    ? BASE_URL
    : BASE_URL.replace(/\/+$/, "") + "/chat/completions";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error(`[zai_delegate] HTTP ${res.status} ${res.statusText}\n${t}`);
    console.error(
      "\nSi el error es de formato (400/422), ajusta `body` en este script al " +
      "esquema exacto de la API Z.ai de coding. Endpoint: " + endpoint,
    );
    process.exit(1);
  }

  const data = await res.json();
  // OpenAI-compatible; si la API devuelve otro árbol, ajustar aquí.
  const out =
    data?.choices?.[0]?.message?.content ??
    data?.content ??
    data?.text ??
    JSON.stringify(data, null, 2);
  process.stdout.write(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  if (!out.endsWith("\n")) process.stdout.write("\n");
}

main().catch((e) => {
  console.error("[zai_delegate] Error:", e.message);
  process.exit(1);
});
