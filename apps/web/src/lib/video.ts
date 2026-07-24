// Convierte una URL de video en algo embebible.
// Soporta YouTube (incluye videos "no listados"/ocultos), Vimeo y .mp4 directo.
export type VideoEmbed =
  | { kind: "youtube"; embedUrl: string }
  | { kind: "vimeo"; embedUrl: string }
  | { kind: "file"; src: string }
  | { kind: "link"; href: string };

export function parseVideo(url?: string | null): VideoEmbed | null {
  if (!url) return null;
  const u = url.trim();

  // YouTube: watch?v=, youtu.be/, /embed/, /shorts/  (los "no listados" embeben igual)
  const yt =
    u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
  if (yt) {
    return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${yt}` };
  }

  // Vimeo
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  if (vm) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${vm}` };

  // Archivo de video directo
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(u)) return { kind: "file", src: u };

  return { kind: "link", href: u };
}
