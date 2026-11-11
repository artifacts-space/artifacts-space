"use client";

import { useState } from "react";

import { EditorMediaProvider } from "@/components/editor/rich/media-context";
import type { MediaUploader } from "@/components/editor/rich/media-uploads";
import RichMarkdownEditor from "@/components/editor/rich-markdown-editor";

/**
 * Development only: the rich Markdown editor with media, and no database or
 * R2. Uploads stay in this tab (each file shows from a local object URL),
 * and the Markdown the editor would save shows under it, so the media e2e
 * test can paste, drop, and pick files and read the result.
 */

/** A file that "exists": it shows a real image from the site. */
export const fixtureImageId = "00000000-0000-4000-8000-0000000000a1";
/** A file that does not: loading it fails, as for a reader without access. */
export const fixtureMissingId = "00000000-0000-4000-8000-0000000000a2";

export const mediaFixtureMarkdown = `# Media fixture

Intro paragraph.

![Dusk over the hills](/api/files/${fixtureImageId}#width=50 "A preset caption")

![Gone](/api/files/${fixtureMissingId})

End paragraph.
`;

const uploaded = new Map<string, string>();
let uploads = 0;

/** Keeps the file in this tab and answers like the real flow, with progress. */
const uploadInMemory: MediaUploader = async (file, onProgress) => {
  onProgress(50);
  await new Promise((resolve) => setTimeout(resolve, 150));
  uploads += 1;
  const id = `00000000-0000-4000-8000-${String(uploads).padStart(12, "0")}`;
  uploaded.set(id, URL.createObjectURL(file));
  onProgress(100);
  return { id, filename: file.name, contentType: file.type || "application/octet-stream" };
};

function urlFor(fileId: string): string {
  if (fileId === fixtureImageId) return "/hero-dusk.webp";
  return uploaded.get(fileId) ?? `/dev/missing-file/${fileId}.png`;
}

/** See the notes at the top of this file. */
export function MediaEditorFixture() {
  const [markdown, setMarkdown] = useState(mediaFixtureMarkdown);
  return (
    <EditorMediaProvider upload={uploadInMemory} urlFor={urlFor}>
      <main className="mx-auto w-full max-w-[72ch] px-4 py-10">
        <RichMarkdownEditor value={markdown} onChange={setMarkdown} label="Artifact content" />
        <h2 className="mt-10 text-lg font-medium">Saved Markdown</h2>
        <pre data-testid="fixture-markdown" className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm whitespace-pre-wrap">{markdown}</pre>
      </main>
    </EditorMediaProvider>
  );
}
