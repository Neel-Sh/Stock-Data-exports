import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tape — Historical market data, made usable",
  description: "Build clean, thesis-ready historical market datasets and export them to Excel or Google Sheets.",
  applicationName: "Tape",
  openGraph: {
    title: "Tape — Historical market data, made usable",
    description: "Ten years of clean market history. One research-ready export.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Tape historical market data workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tape — Historical market data, made usable",
    description: "Ten years of clean market history. One research-ready export.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
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
