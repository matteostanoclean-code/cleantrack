import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerAnmeldung from "@/components/ServiceWorkerAnmeldung";

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap"
});

const stampFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-stamp",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Schichtklar",
  description: "Mobile Einsatz-, Zeit- und Stunden-App für Gebäudereinigung",
  manifest: "/manifest.json",
  // Ohne diese Angaben nimmt sich der Browser irgendein Bild aus dem Ordner.
  // Das Zeichen gehört auch in den Tab und auf den Home-Bildschirm des iPhones.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Schichtklar"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F2F5F1"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${bodyFont.variable} ${stampFont.variable}`}>
      <body>
        <ServiceWorkerAnmeldung />
        {children}
      </body>
    </html>
  );
}
