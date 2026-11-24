import type { Metadata, Viewport } from "next";
import "@fontsource-variable/besley";
import "@fontsource-variable/archivo-narrow";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jam",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Jam", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f3efe4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
