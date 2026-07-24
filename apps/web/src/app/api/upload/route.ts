import { put } from "@vercel/blob";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 4 * 1024 * 1024; // 4 MB (límite práctico del body serverless de Vercel)
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

/**
 * Sube una imagen (comprobante, portada de curso, avatar) a Vercel Blob y
 * devuelve su URL pública. Requiere BLOB_READ_WRITE_TOKEN (se crea al habilitar
 * "Storage → Blob" en el proyecto de Vercel).
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return fail("Almacenamiento no configurado. Habilita 'Storage → Blob' en Vercel.", 503);
  }

  const folder = new URL(req.url).searchParams.get("folder") ?? "uploads";
  const safeFolder = ["proofs", "covers", "avatars", "uploads"].includes(folder) ? folder : "uploads";

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Archivo faltante", 400);
  if (file.size > MAX) return fail("La imagen supera 4 MB", 413);
  if (!ALLOWED.includes(file.type)) return fail("Solo imágenes (png, jpg, webp, gif)", 415);

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `${safeFolder}/${me.id}-${Date.now()}.${ext}`;

  const blob = await put(key, file, { access: "public", addRandomSuffix: true });
  return ok({ url: blob.url });
}
