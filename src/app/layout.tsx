import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

import { Providers } from "@/components/providers";

import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
 * Satoshi draws the backtick (U+0060) as a raised accent with almost no width,
 * so it floats over the next letter. This face holds only Geist Mono's
 * backtick (subset from the OFL-licensed geist@1.8.2 variable font, under 1 KB)
 * and sits first in the sans stack; unicode-range makes the browser use it for
 * that one character and download it only when a backtick is on the page.
 */
const backtick = localFont({
  src: "./fonts/backtick-mono.woff2",
  variable: "--font-backtick",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0060" }],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000",
  ),
  title: {
    default: "artifacts.space — Shared artifacts for coding agents",
    template: "%s · artifacts.space",
  },
  description:
    "An open-source artifact hub for coding agents. Create, read, update, and share artifacts from any MCP client, across your team.",
  openGraph: {
    title: "artifacts.space",
    description: "A shared artifact hub for coding agents.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1917" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${backtick.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
