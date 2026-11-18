import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ServerPageHost } from "@/components/artifact-view/server-page-host";
import { EditorFixture } from "@/components/dev/editor-fixture";
import { editorFixtureKinds, type EditorFixtureKind } from "@/components/dev/fixture-content";
import { listItemsFixtureMarkdown } from "@/components/dev/list-items-fixture";
import { galleryFixtureFiles, galleryFixtureMarkdown, MediaEditorFixture, MediaReaderFixture } from "@/components/dev/media-editor-fixture";

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
  const { kind, save, catchup, pagehost, doc, as, files } = await searchParams;
  if (kind === "media" && doc === "gallery") return as === "reader" ? <MediaReaderFixture /> : <MediaEditorFixture initial={galleryFixtureMarkdown} files={galleryFixtureFiles} />;
  if (kind === "media") return <MediaEditorFixture />;
  if (kind === "lists") return <MediaEditorFixture initial={listItemsFixtureMarkdown} />;
  const fixture = <EditorFixture kind={isFixtureKind(kind) ? kind : "ui"} failingSaves={save === "fail"} agentSaves={save === "agent"} catchUp={catchup === "agent" || catchup === "own-save" ? catchup : null} pageFiles={files === "1"} />;
  // An HTML artifact's page runs on the page host; `pagehost=none` leaves it out, as on a deployment that has none.
  return pagehost === "none" ? fixture : <ServerPageHost>{fixture}</ServerPageHost>;
}

/**
 * Development-only page for the editor layout e2e test: the page editor on
 * a long artifact, without a database. `?kind=` picks ui, json, markdown, blocks (a short interface), styled (every block styled by a screen prop), data, sheet (a CSV at the size limit), canvas (four phone screens), or html (a page with a script; `?pagehost=none` shows it where no page host is set up, and `?files=1` starts it with two page files; page files stay in the tab, fixture-page-files.ts),
 * or media: the Markdown editor with uploads kept in the tab (media-editor-fixture.tsx; `?doc=gallery` loads a document with several images, and `&as=reader` shows it in the read view),
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
