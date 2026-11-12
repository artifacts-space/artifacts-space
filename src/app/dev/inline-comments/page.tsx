import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { InlineCommentsFixture } from "@/components/dev/inline-comments-fixture";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Inline comments fixture",
  robots: { index: false, follow: false },
};

async function Fixture({ searchParams }: { searchParams: PageProps<"/dev/inline-comments">["searchParams"] }) {
  const { as, seed, dialog } = await searchParams;
  return <InlineCommentsFixture reader={as === "reader"} seed={typeof seed === "string" ? seed : undefined} dialog={dialog === "1"} />;
}

/**
 * Development-only page for the inline comments e2e test: a Markdown
 * artifact on the page editor, or its read view with `?as=reader`, with
 * comments kept in memory (`?seed=1` starts with some, `?seed=escaped` with escaped Markdown; `?dialog=1` puts the
 * thread in the Comments dialog), without a database
 * (inline-comments-fixture.tsx). Returns 404 in every other environment.
 */
export default function InlineCommentsFixturePage({ searchParams }: PageProps<"/dev/inline-comments">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Fixture searchParams={searchParams} />
    </Suspense>
  );
}
