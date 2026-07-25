import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail, emailTemplate } from "./mailer";

const APP_URL = process.env.APP_URL || "https://klanly.vercel.app";

/**
 * Crea una notificación in-app y, si se indica `emailSubject`, envía también un
 * email al usuario (Gmail SMTP; no-op si no hay credenciales).
 */
export async function notify(
  userId: string,
  opts: { type: string; body: string; communityId?: string | null; emailSubject?: string; cta?: { label: string; url?: string } },
) {
  await db.insert(notifications).values({
    userId,
    communityId: opts.communityId ?? null,
    type: opts.type,
    body: opts.body,
  });

  if (opts.emailSubject) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (u?.email) {
      const cta = opts.cta ? { label: opts.cta.label, url: opts.cta.url || APP_URL } : undefined;
      await sendEmail(u.email, opts.emailSubject, emailTemplate(opts.emailSubject, opts.body, cta));
    }
  }
}
