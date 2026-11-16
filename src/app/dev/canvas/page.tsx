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
  const { fixture, capture, theme } = await searchParams;
  return <CanvasFixture name={isFixtureName(fixture) ? fixture : "site"} capture={capture === "1"} theme={typeof theme === "string" ? theme : undefined} />;
}

/**
 * Development-only page for the canvas e2e tests: one canvas in the page
 * column, without a database (canvas-fixture.tsx). `?fixture=` picks site
 * (one page at three sizes), flow (four phone screens), placed (two rows
 * placed by hand), empty, broken (one good frame and two that cannot be
 * shown), unreadable, large (a full board, for timing), screens (one
 * screen of section templates in three frames), or pictures (one frame
 * with uploaded pictures). `?capture=1` adds a capture host that draws the
 * frames through a stand-in API, with no database and no file storage;
 * without it the page has no host. `?theme=` (a built-in preset's id, such
 * as paper) puts the canvas in that theme. Returns 404 in every other
 * environment.
 */
export default function CanvasFixturePage({ searchParams }: PageProps<"/dev/canvas">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Fixture searchParams={searchParams} />
    </Suspense>
  );
}
