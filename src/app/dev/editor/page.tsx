import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EditorFixture } from "@/components/dev/editor-fixture";
import { editorFixtureKinds, type EditorFixtureKind } from "@/components/dev/fixture-content";
import { MediaEditorFixture } from "@/components/dev/media-editor-fixture";

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
  const { kind, save } = await searchParams;
  if (kind === "media") return <MediaEditorFixture />;
  return <EditorFixture kind={isFixtureKind(kind) ? kind : "ui"} failingSaves={save === "fail"} />;
}

/**
 * Development-only page for the editor layout e2e test: the page editor on
 * a long artifact, without a database. `?kind=` picks ui, json, markdown, blocks (a short interface), data, or sheet (a CSV at the size limit),
 * or media: the Markdown editor with uploads kept in the tab (media-editor-fixture.tsx).
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
