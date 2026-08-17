import Pusher from "pusher";

let instance: Pusher | null = null;

function getPusher(): Pusher | null {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return null;
  if (!instance) {
    instance = new Pusher({
      appId: PUSHER_APP_ID,
      key: PUSHER_KEY,
      secret: PUSHER_SECRET,
      cluster: PUSHER_CLUSTER,
      useTLS: true,
    });
  }
  return instance;
}

/** Dispara un evento en tiempo real (no-op si Pusher no está configurado). */
export async function trigger(channel: string, event: string, data: unknown) {
  const p = getPusher();
  if (!p) return;
  try {
    await p.trigger(channel, event, data);
  } catch (e) {
    console.error("[pusher] trigger error:", e);
  }
}

/**
 * Como `trigger`, pero informa si realmente se envió.
 * Lo usa el envío a la TV: si el canal no está configurado hay que avisar al
 * usuario en vez de dejarlo mirando una pantalla que nunca reacciona.
 */
export async function pushToChannel(channel: string, event: string, data: unknown): Promise<boolean> {
  const p = getPusher();
  if (!p) return false;
  try {
    await p.trigger(channel, event, data);
    return true;
  } catch (e) {
    console.error("[pusher] pushToChannel error:", e);
    return false;
  }
}
