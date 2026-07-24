import { db } from "@/db";
import { memberships } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

// Umbrales de puntos acumulados para alcanzar cada nivel (1..9), estilo Skool.
export const LEVEL_THRESHOLDS = [0, 5, 20, 65, 155, 515, 2015, 8015, 33015];

export function levelForPoints(points: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(level, 9);
}

export function pointsToNextLevel(points: number): number | null {
  const current = levelForPoints(points);
  if (current >= 9) return null;
  return LEVEL_THRESHOLDS[current] - points; // threshold del siguiente nivel
}

/**
 * Suma puntos a un miembro y recalcula su nivel.
 * Devuelve el nuevo total de puntos y nivel (o null si no es miembro).
 */
export async function awardPoints(communityId: string, userId: string, delta: number) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.communityId, communityId), eq(memberships.userId, userId)))
    .limit(1);
  if (!m) return null;

  const newPoints = Math.max(0, m.points + delta);
  const newLevel = levelForPoints(newPoints);
  await db
    .update(memberships)
    .set({ points: newPoints, level: newLevel })
    .where(eq(memberships.id, m.id));

  return { points: newPoints, level: newLevel, leveledUp: newLevel > m.level };
}
