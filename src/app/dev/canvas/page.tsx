import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CanvasFixture, canvasFixtureNames, type CanvasFixtureName } from "@/components/dev/canvas-fixture";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Canvas fixture",
  robots: { index: false, follow: false },
};

function isFixtureName(value: unknown): value is CanvasFixtureName {
  return canvasFixtureNames.some((name) => name === value);
}

async function Fixture({ searchParams }: { searchParams: PageProps<"/dev/canvas">["searchParams"] }) {
  const { fixture } = await searchParams;
  return <CanvasFixture name={isFixtureName(fixture) ? fixture : "site"} />;
}

/**
 * Development-only page for the canvas e2e tests: one canvas in the page
 * column, without a database (canvas-fixture.tsx). `?fixture=` picks site
 * (one page at three sizes), flow (four phone screens), placed (two rows
 * placed by hand), empty, broken (one good frame and two that cannot be
 * shown), unreadable, or large (a full board, for timing). Returns 404 in
 * every other environment.
 */
export default function CanvasFixturePage({ searchParams }: PageProps<"/dev/canvas">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Fixture searchParams={searchParams} />
    </Suspense>
  );
}
