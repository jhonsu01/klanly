import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return transporter;
}

/** Versión en texto plano del HTML (los correos solo-HTML puntúan peor en spam). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Envía un email (Gmail SMTP). Si no hay credenciales, no hace nada (graceful). */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  try {
    await t.sendMail({
      from: `Klanly <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      text: htmlToText(html), // alternativa en texto: mejora la entregabilidad
      replyTo: process.env.GMAIL_USER,
    });
    return true;
  } catch (e) {
    console.error("[mailer] error enviando email:", e);
    return false;
  }
}

export function emailTemplate(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a22">
    <div style="font-weight:800;font-size:22px;color:#5b3df5">Klanly</div>
    <h2 style="font-size:18px;margin:16px 0 8px">${title}</h2>
    <p style="font-size:14px;line-height:1.6;color:#444">${body}</p>
    ${cta ? `<p><a href="${cta.url}" style="display:inline-block;background:#5b3df5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${cta.label}</a></p>` : ""}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <small style="color:#999">Klanly · plataforma de comunidades de pago · klanly.vercel.app</small>
  </div>`;
}
