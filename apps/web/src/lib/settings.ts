import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_PLANS = [
  { label: "1 mes", months: 1, priceCents: 1000, currency: "USD" },
  { label: "3 meses", months: 3, priceCents: 2700, currency: "USD" },
  { label: "6 meses", months: 6, priceCents: 5000, currency: "USD" },
  { label: "1 año", months: 12, priceCents: 9000, currency: "USD" },
];

/** Devuelve el singleton de ajustes; lo crea con planes por defecto si no existe. */
export async function getPlatformSettings() {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "default")).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(platformSettings)
    .values({ id: "default", adminAccounts: [], producerPlans: DEFAULT_PLANS })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db.select().from(platformSettings).where(eq(platformSettings.id, "default")).limit(1);
  return again;
}
