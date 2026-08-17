import { z } from "zod";
import { db } from "@/db";
import { castDevices } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIN_MINUTOS = 10;

/** PIN de 6 dígitos sin ceros a la izquierda (se lee mejor en una TV). */
function nuevoPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * La TELEVISIÓN pide un PIN para que la emparejen.
 *
 * No requiere sesión: una TV no tiene cuenta. Lo que la protege es que el
 * canal de tiempo real usa el `deviceId` (un uuid que solo conoce la TV), no
 * el PIN. Aunque alguien adivine un PIN de 6 dígitos, no puede escuchar el
 * canal de otra pantalla; a lo sumo emparejaría su propia sesión con una TV
 * ajena durante los 10 minutos de validez.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`cast-pair:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return fail("Demasiadas solicitudes. Espera un momento.", 429);

  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ label: z.string().max(40).optional() }).safeParse(body);
  const label = parsed.success ? parsed.data.label : undefined;

  // Un PIN que ya esté vivo no se reutiliza
  let pin = nuevoPin();
  for (let i = 0; i < 5; i++) {
    const [choque] = await db
      .select({ id: castDevices.id })
      .from(castDevices)
      .where(and(eq(castDevices.pin, pin), gt(castDevices.pinExpiresAt, new Date())))
      .limit(1);
    if (!choque) break;
    pin = nuevoPin();
  }

  const [dev] = await db
    .insert(castDevices)
    .values({
      pin,
      label: label ?? null,
      pinExpiresAt: new Date(Date.now() + PIN_MINUTOS * 60_000),
    })
    .returning();

  return ok({
    deviceId: dev.id,
    pin: dev.pin,
    channel: `cast-${dev.id}`,
    expiresInSeconds: PIN_MINUTOS * 60,
  }, 201);
}
