import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "UbicaTec — Mapa del Tec de Monterrey",
  description:
    "Navega el campus del Tec de Monterrey y mantente al día con noticias, eventos y avisos de la comunidad.",
  icons: [{ rel: "icon", url: "/favicon.ico", sizes: "256x256", type: "image/x-icon" }],
  openGraph: {
    title: "UbicaTec",
    description: "Mapa interactivo y hub de noticias para el Tec de Monterrey.",
    locale: "es_MX",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "UbicaTec",
    description: "Mapa interactivo y hub de noticias para el Tec de Monterrey.",
  },
  other: {
    "color-scheme": "light",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1c4e89",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <head>
        {/* Marker emitted on the source page alongside its font metrics. */}
        <meta name="next-size-adjust" content="" />
        <link
          rel="preload"
          href="/fonts/BigShoulders.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
