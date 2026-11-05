import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "https://artifacts.space"),
  title: {
    default: "artifacts.space — Shared context for coding agents",
    template: "%s · artifacts.space",
  },
  description:
    "Create, retrieve, and share artifacts across coding sessions. One MCP memory layer for every agent, lab, and harness.",
  openGraph: {
    title: "artifacts.space",
    description: "Context that outlives the session.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#111216",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
