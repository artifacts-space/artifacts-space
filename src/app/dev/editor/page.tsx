import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EditorFixture } from "@/components/dev/editor-fixture";
import { editorFixtureKinds, type EditorFixtureKind } from "@/components/dev/fixture-content";
import { listItemsFixtureMarkdown } from "@/components/dev/list-items-fixture";
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
  if (kind === "lists") return <MediaEditorFixture initial={listItemsFixtureMarkdown} />;
  return <EditorFixture kind={isFixtureKind(kind) ? kind : "ui"} failingSaves={save === "fail"} agentSaves={save === "agent"} />;
}

/**
 * Development-only page for the editor layout e2e test: the page editor on
 * a long artifact, without a database. `?kind=` picks ui, json, markdown, blocks (a short interface), data, or sheet (a CSV at the size limit),
 * or media: the Markdown editor with uploads kept in the tab (media-editor-fixture.tsx),
 * or lists: the same editor on list items that hold code blocks (list-items-fixture.ts).
 * `?save=fail` fails every save; `?save=agent` lands the first save over an agent's save.
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
