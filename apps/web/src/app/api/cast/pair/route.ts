import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { castDevices } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIN_MINUTOS = 10;

/** PIN de 6 dígitos (sin ceros a la izquierda: se lee mejor en una TV). */
const nuevoPin = () => String(Math.floor(100000 + Math.random() * 900000));

async function pinLibre() {
  let pin = nuevoPin();
  for (let i = 0; i < 5; i++) {
    const [choque] = await db
      .select({ id: castDevices.id })
      .from(castDevices)
      .where(and(eq(castDevices.pin, pin), gt(castDevices.pinExpiresAt, new Date())))
      .limit(1);
    if (!choque) return pin;
    pin = nuevoPin();
  }
  return pin;
}

const Body = z.object({
  label: z.string().max(40).optional(),
  /** Identidad que la TV guardó la primera vez, para recuperarla al recargarse. */
  deviceId: z.string().uuid().optional(),
  deviceSecret: z.string().min(16).max(128).optional(),
});

/**
 * La TELEVISIÓN se registra o RECUPERA su identidad.
 *
 * Recuperarla es lo importante: si en cada recarga (atrás en el mando, reinicio
 * del televisor) pidiera un dispositivo nuevo, el PIN cambiaría y el celular
 * seguiría enviando al canal viejo — el envío contestaba 200 y en la pantalla
 * no aparecía nada. Con `deviceId` + `deviceSecret` la TV conserva SU canal.
 *
 * No requiere sesión: una TV no tiene cuenta. Lo que la protege es que el canal
 * de tiempo real es el `deviceId` (un uuid), nunca el PIN de 6 dígitos.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`cast-pair:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return fail("Demasiadas solicitudes. Espera un momento.", 429);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const body = parsed.success ? parsed.data : {};
  const ahora = new Date();

  // ── ¿La TV ya tenía identidad? ────────────────────────────────────────────
  if (body.deviceId && body.deviceSecret) {
    const [dev] = await db
      .select()
      .from(castDevices)
      .where(eq(castDevices.id, body.deviceId))
      .limit(1);

    if (dev && dev.deviceSecret === body.deviceSecret) {
      const emparejada = !!dev.userId && !!dev.pairedUntil && dev.pairedUntil > ahora;

      // Si sigue emparejada no se toca el PIN: el celular ya sabe enviar aquí.
      // Si no, se refresca para que se pueda emparejar de nuevo.
      const pin = emparejada ? dev.pin : await pinLibre();
      const pinExpiresAt = emparejada ? dev.pinExpiresAt : new Date(Date.now() + PIN_MINUTOS * 60_000);

      await db.update(castDevices)
        .set({ pin, pinExpiresAt, lastSeenAt: ahora, label: body.label ?? dev.label })
        .where(eq(castDevices.id, dev.id));

      return ok({
        deviceId: dev.id,
        deviceSecret: dev.deviceSecret,
        pin,
        channel: `cast-${dev.id}`,
        paired: emparejada,
        expiresInSeconds: Math.max(0, Math.floor((pinExpiresAt.getTime() - Date.now()) / 1000)),
      });
    }
    // Identidad desconocida (base limpiada, secreto que no cuadra): se crea otra.
  }

  // ── Pantalla nueva ────────────────────────────────────────────────────────
  const [dev] = await db
    .insert(castDevices)
    .values({
      pin: await pinLibre(),
      deviceSecret: randomBytes(24).toString("hex"),
      label: body.label ?? null,
      pinExpiresAt: new Date(Date.now() + PIN_MINUTOS * 60_000),
    })
    .returning();

  return ok({
    deviceId: dev.id,
    deviceSecret: dev.deviceSecret,
    pin: dev.pin,
    channel: `cast-${dev.id}`,
    paired: false,
    expiresInSeconds: PIN_MINUTOS * 60,
  }, 201);
}
