import type { MetadataRoute } from "next";
import { db } from "@/db";
import { communities } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const revalidate = 3600;

const BASE = process.env.APP_URL || "https://klanly.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  ];
  try {
    const rows = await db
      .select({ slug: communities.slug, createdAt: communities.createdAt })
      .from(communities)
      .where(eq(communities.isPublic, true))
      .orderBy(desc(communities.createdAt))
      .limit(1000);
    for (const r of rows) {
      entries.push({ url: `${BASE}/c/${r.slug}`, lastModified: r.createdAt ?? new Date(), changeFrequency: "weekly", priority: 0.7 });
    }
  } catch {
    // DB no disponible en build: solo el home
  }
  return entries;
}
