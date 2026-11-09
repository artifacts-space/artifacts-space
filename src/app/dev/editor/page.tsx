import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EditorFixture } from "@/components/dev/editor-fixture";
import { editorFixtureKinds, type EditorFixtureKind } from "@/components/dev/fixture-content";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Editor fixture",
  robots: { index: false, follow: false },
};

function isFixtureKind(value: unknown): value is EditorFixtureKind {
  return editorFixtureKinds.some((kind) => kind === value);
}

async function Fixture({ searchParams }: { searchParams: PageProps<"/dev/editor">["searchParams"] }) {
  const { kind } = await searchParams;
  return <EditorFixture kind={isFixtureKind(kind) ? kind : "ui"} />;
}

/**
 * Development-only page for the editor layout e2e test: the page editor on
 * a long artifact, without a database. `?kind=` picks ui, json, markdown, or blocks (a short interface).
 * Returns 404 in every other environment.
 */
export default function EditorFixturePage({ searchParams }: PageProps<"/dev/editor">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Fixture searchParams={searchParams} />
    </Suspense>
  );
}
