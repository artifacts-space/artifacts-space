import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "https://artifacts.space"),
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
      className={`${geistMono.variable} h-full antialiased`}
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
