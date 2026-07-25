// Compresión de imágenes en el navegador ANTES de subir.
// Motivo: las fotos de celular pesan 2–5 MB (y el iPhone manda HEIC), lo que
// hacía fallar la subida de comprobantes cuando no hay Vercel Blob (límite 1.5 MB).
// Redimensionamos a lado máximo y reencodamos a JPEG hasta caber en el objetivo.

const MAX_SIDE = 1600;
const TARGET_BYTES = 1_200_000; // margen bajo el límite de 1.5 MB del fallback

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Devuelve una versión comprimida (JPEG) de la imagen.
 * Si el archivo ya es pequeño y de un tipo soportado, lo deja igual.
 * Si algo falla, devuelve el original (el servidor validará).
 */
export async function compressImage(file: File): Promise<File> {
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  const smallEnough = file.size <= TARGET_BYTES && !isHeic;
  const supported = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(file.type);
  if (smallEnough && supported) return file;

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Fondo blanco para PNG con transparencia (al pasar a JPEG)
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await toBlob(canvas, q);
      if (blob && blob.size <= TARGET_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], name, { type: "image/jpeg" });
      }
    }
    // Último intento con la calidad más baja aunque exceda
    const blob = await toBlob(canvas, 0.35);
    if (blob) {
      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return new File([blob], name, { type: "image/jpeg" });
    }
    return file;
  } catch {
    return file; // el servidor dará el error claro
  }
}
