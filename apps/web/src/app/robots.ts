import type { MetadataRoute } from "next";

const BASE = process.env.APP_URL || "https://klanly.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/afiliados", "/pagos", "/invoice/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
