import { put } from "@vercel/blob";
import { currentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BLOB = 4 * 1024 * 1024;      // 4 MB con Vercel Blob
const MAX_INLINE = 1_500_000;          // 1.5 MB si se guarda inline (base64) sin Blob
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

/**
 * Sube una imagen (comprobante, portada, avatar) y devuelve su URL.
 * - Si hay Vercel Blob (BLOB_READ_WRITE_TOKEN): sube y devuelve URL pública.
 * - Si NO hay Blob: la guarda como data URL (base64) para que el comprobante
 *   funcione igual y se pueda VER en línea (reciclado de la idea de rifas:
 *   subir → el admin ve el comprobante → aprueba). Ideal habilitar Blob en prod.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);
  // Sin verificar el correo no se sube nada: si no, una cuenta desechable
  // puede llenar el almacenamiento (o subir material ilicito) en segundos.
  if (!me.emailVerified) return fail("Verifica tu correo para subir archivos.", 403, { needsVerify: true });
  // Tope por usuario: 20 subidas por minuto es de sobra para el uso real.
  const rl = rateLimit(`upload:${me.id}`, 20, 60_000);
  if (!rl.ok) return fail("Demasiadas subidas seguidas. Espera un momento.", 429);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Archivo faltante", 400);
  if (!ALLOWED.includes(file.type)) {
    const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    return fail(
      isHeic
        ? "Ese formato de foto (HEIC del iPhone) no es compatible. En tu iPhone: Ajustes → Cámara → Formatos → 'Más compatible', o toma una captura de pantalla de la foto y súbela."
        : "Solo imágenes (png, jpg, webp, gif).",
      415,
    );
  }

  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (hasBlob) {
    if (file.size > MAX_BLOB) return fail("La imagen supera 4 MB", 413);
    const folder = new URL(req.url).searchParams.get("folder") ?? "uploads";
    const safeFolder = ["proofs", "covers", "avatars", "uploads"].includes(folder) ? folder : "uploads";
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const blob = await put(`${safeFolder}/${me.id}-${Date.now()}.${ext}`, file, { access: "public", addRandomSuffix: true });
    return ok({ url: blob.url });
  }

  // Fallback sin Blob: data URL (base64)
  if (file.size > MAX_INLINE) return fail("Sin almacenamiento configurado: la imagen debe pesar menos de 1.5 MB.", 413);
  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
  return ok({ url: dataUrl });
}
