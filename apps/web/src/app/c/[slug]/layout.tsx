import type { Metadata } from "next";
import { db } from "@/db";
import { communities } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const [c] = await db.select().from(communities).where(eq(communities.slug, params.slug)).limit(1);
    if (!c) return { title: "Comunidad" };
    const desc = c.description || `Únete a ${c.name} en Klanly.`;
    const images = c.iconUrl && c.iconUrl.startsWith("http") ? [c.iconUrl] : undefined;
    return {
      title: c.name,
      description: desc,
      openGraph: { title: c.name, description: desc, images },
      twitter: { card: "summary", title: c.name, description: desc, images },
    };
  } catch {
    return { title: "Comunidad" };
  }
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
