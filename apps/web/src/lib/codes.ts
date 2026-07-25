import { db } from "@/db";
import { authCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export function random6(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Emite un código de 6 dígitos para un propósito (reemplaza los previos). */
export async function issueCode(userId: string, purpose: string, ttlMin = 15): Promise<string> {
  await db.delete(authCodes).where(and(eq(authCodes.userId, userId), eq(authCodes.purpose, purpose)));
  const code = random6();
  await db.insert(authCodes).values({ userId, purpose, code, expiresAt: new Date(Date.now() + ttlMin * 60_000) });
  return code;
}

/** Valida y consume un código (un solo uso). */
export async function consumeCode(userId: string, purpose: string, code: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(authCodes)
    .where(and(eq(authCodes.userId, userId), eq(authCodes.purpose, purpose), eq(authCodes.code, (code || "").trim())))
    .limit(1);
  if (!row) return false;
  await db.delete(authCodes).where(eq(authCodes.id, row.id));
  if (new Date(row.expiresAt).getTime() < Date.now()) return false;
  return true;
}
