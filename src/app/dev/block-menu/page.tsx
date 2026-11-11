import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BlockMenuFixture } from "@/components/dev/block-menu-fixture";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Block menu fixture",
  robots: { index: false, follow: false },
};

async function Fixture({ searchParams }: { searchParams: PageProps<"/dev/block-menu">["searchParams"] }) {
  const { as } = await searchParams;
  return <BlockMenuFixture reader={as === "reader"} />;
}

/**
 * Development-only page for the block menu e2e test: a Markdown artifact on
 * the page editor, or its read view with `?as=reader`, without a database
 * (block-menu-fixture.tsx). Returns 404 in every other environment.
 */
export default function BlockMenuFixturePage({ searchParams }: PageProps<"/dev/block-menu">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Fixture searchParams={searchParams} />
    </Suspense>
  );
}
