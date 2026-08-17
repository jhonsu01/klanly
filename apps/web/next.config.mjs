/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Content-Security-Policy. Limita de donde puede cargarse cada tipo de
  // recurso, asi un HTML inyectado no puede traerse un script de fuera ni
  // filtrar datos a un dominio ajeno.
  //   'unsafe-inline'/'unsafe-eval' en script-src: los exige el runtime de
  //   Next 14 (hidratacion y dev). Endurecer a nonces requiere middleware.
  //   img-src data: y blob:  -> comprobantes en base64 cuando no hay Blob.
  //   frame-src               -> reproductores de YouTube/Vimeo de las lecciones.
  //   connect-src wss:        -> realtime de Pusher.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      // youtube.com + ytimg: la IFrame API, necesaria para saber cuando termina
      // el video y contar las repeticiones del modo entrenamiento.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["@neondatabase/serverless", "bcryptjs", "nodemailer", "pusher"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
