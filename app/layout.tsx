import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tape — Market research workspace",
  description: "Build historical datasets, research factors, and current index views in one focused workspace.",
  applicationName: "Tape",
  openGraph: {
    title: "Tape — Market research workspace",
    description: "Historical datasets, reproducible research factors, and current index views.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Tape historical market data workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tape — Market research workspace",
    description: "Historical datasets, reproducible research factors, and current index views.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: "#080808",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
