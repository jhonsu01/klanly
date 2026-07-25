import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "./ThemeToggle";

const BASE = process.env.APP_URL || "https://klanly.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: { default: "Klanly — comunidades de pago", template: "%s · Klanly" },
  description: "Crea tu comunidad, publica cursos, cobra membresías y gana con afiliados.",
  applicationName: "Klanly",
  openGraph: {
    type: "website",
    siteName: "Klanly",
    title: "Klanly — comunidades de pago",
    description: "Crea tu comunidad, publica cursos, cobra membresías y gana con afiliados.",
    url: BASE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Klanly — comunidades de pago",
    description: "Crea tu comunidad, publica cursos, cobra membresías y gana con afiliados.",
  },
};

const themeScript = `try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
