import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Not found", robots: { index: false, follow: false } };

/** The 404 page. It never says whether a private artifact or team exists. */
export default function NotFound() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 w-full max-w-[960px] items-center px-6">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-[960px] px-6 py-24">
        <p className="text-xs text-muted-foreground">404</p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.02em]">This page is not here</h1>
        <p className="mt-3 max-w-lg text-md leading-7 text-muted-foreground">
          The link may be wrong, or the artifact or team is private. Ask the person who shared it to check who can read it.
        </p>
        <Link href="/" className="mt-8 inline-block text-sm underline decoration-border underline-offset-4 hover:decoration-foreground">
          Go to artifacts.space
        </Link>
      </main>
    </div>
  );
}
