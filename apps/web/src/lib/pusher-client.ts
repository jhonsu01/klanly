"use client";

import Pusher from "pusher-js";

let client: Pusher | null = null;

/** Instancia del cliente Pusher (o null si no está configurado). */
export function getPusherClient(): Pusher | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null;
  if (!client) client = new Pusher(key, { cluster });
  return client;
}

export const realtimeEnabled = () => !!process.env.NEXT_PUBLIC_PUSHER_KEY;
