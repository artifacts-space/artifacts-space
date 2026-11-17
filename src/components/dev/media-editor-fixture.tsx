"use client";

import { useState } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ArtifactFilesProvider } from "@/components/artifact-view/files-context";
import { BlockLinkTarget } from "@/components/block-links/block-link-target";
import { EditorMediaProvider } from "@/components/editor/rich/media-context";
import type { MediaUploader } from "@/components/editor/rich/media-uploads";
import RichMarkdownEditor from "@/components/editor/rich-markdown-editor";
import type { FileDto } from "@/lib/files/types";

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

/** A second image, square, with its real pixel size stored. */
export const fixtureSquareId = "00000000-0000-4000-8000-0000000000a3";
/** An image whose stored pixel size is not the picture's: it must still show at its own shape. */
export const fixtureMisstatedId = "00000000-0000-4000-8000-0000000000a4";
/** A file that shows as a download card. */
export const fixtureArchiveId = "00000000-0000-4000-8000-0000000000a5";

/** A document with several images (`?doc=gallery`), for opening them larger, their stored shapes, and the file card. */
export const galleryFixtureMarkdown = `# Gallery fixture

First paragraph.

![Dusk over the hills](/api/files/${fixtureImageId}#width=50 "A preset caption")

Middle paragraph.

![The site's mark](/api/files/${fixtureSquareId})

![](/api/files/${fixtureMisstatedId} "A picture without alt text")

![handbook.zip](/api/files/${fixtureArchiveId}#file)

End paragraph.
`;

const listed = { createdAt: "2026-11-17T00:00:00.000Z", replacedAt: null, embedded: true } as const;

/** The gallery document's files as a saved artifact lists them, with the pixel size the server stored for each image. */
export const galleryFixtureFiles: FileDto[] = [
  { ...listed, id: fixtureImageId, filename: "dusk.webp", contentType: "image/webp", size: 30_314, width: 2880, height: 2160 },
  { ...listed, id: fixtureSquareId, filename: "mark.png", contentType: "image/png", size: 48_200, width: 1254, height: 1254 },
  { ...listed, id: fixtureMisstatedId, filename: "misstated.webp", contentType: "image/webp", size: 30_314, width: 100, height: 100 },
  { ...listed, id: fixtureArchiveId, filename: "handbook.zip", contentType: "application/zip", size: 1_300_000 },
];

const uploaded = new Map<string, string>();
let uploads = 0;

declare global {
  interface Window {
    /** How many of the fixture's uploads were stopped by Cancel, for the e2e test. */
    fixtureStoppedUploads?: number;
  }
}

/** Set to "1" in sessionStorage, an upload waits half way until it is cancelled, so a test can press Cancel. */
const holdUploadsKey = "fixture:hold-media-uploads";

/** The bytes "on their way": 150 ms, or until Cancel while uploads are held. Rejects when the upload is stopped, as the real request does. */
function sending(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const held = window.sessionStorage.getItem(holdUploadsKey) === "1";
    const timer = held ? null : setTimeout(resolve, 150);
    signal?.addEventListener("abort", () => {
      if (timer) clearTimeout(timer);
      window.fixtureStoppedUploads = (window.fixtureStoppedUploads ?? 0) + 1;
      reject(new Error("The upload was cancelled."));
    }, { once: true });
  });
}

/** Keeps the file in this tab and answers like the real flow, with progress. */
const uploadInMemory: MediaUploader = async (file, onProgress, signal) => {
  onProgress(50);
  await sending(signal);
  uploads += 1;
  const id = `00000000-0000-4000-8000-${String(uploads).padStart(12, "0")}`;
  uploaded.set(id, URL.createObjectURL(file));
  onProgress(100);
  return { id, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size };
};

const standIns: Record<string, string> = {
  [fixtureImageId]: "/hero-dusk.webp",
  [fixtureSquareId]: "/artifacts-space-icon.png",
  // The same picture at another address: the list says it is 100 by 100, and it is not.
  [fixtureMisstatedId]: "/hero-dusk.webp?misstated",
};

function urlFor(fileId: string): string {
  return standIns[fileId] ?? uploaded.get(fileId) ?? `/dev/missing-file/${fileId}.png`;
}

/** The gallery document as a reader sees it (`?doc=gallery&as=reader`): the read view, with the files a saved artifact lists. */
export function MediaReaderFixture() {
  return (
    <ArtifactFilesProvider files={galleryFixtureFiles} urlFor={urlFor}>
      <main className="mx-auto w-full max-w-[72ch] px-4 py-10">
        <article data-block-links="">
          <ArtifactView kind="markdown" content={galleryFixtureMarkdown} title="Gallery fixture" language="" />
        </article>
        <BlockLinkTarget />
      </main>
    </ArtifactFilesProvider>
  );
}

const noFiles: FileDto[] = [];

/**
 * See the notes at the top of this file. `initial` loads other Markdown,
 * such as the list items fixture. `files` are the files a saved artifact
 * would list, as the app's editor is given them.
 */
export function MediaEditorFixture({ initial = mediaFixtureMarkdown, files = noFiles }: { initial?: string; files?: FileDto[] }) {
  const [markdown, setMarkdown] = useState(initial);
  return (
    <EditorMediaProvider upload={uploadInMemory} urlFor={urlFor}>
      <ArtifactFilesProvider files={files}>
        <main className="mx-auto w-full max-w-[72ch] px-4 py-10">
          <article data-block-links="">
            <RichMarkdownEditor value={markdown} onChange={setMarkdown} label="Artifact content" />
          </article>
          <BlockLinkTarget />
          <h2 className="mt-10 text-lg font-medium">Saved Markdown</h2>
          <pre data-testid="fixture-markdown" className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm whitespace-pre-wrap">{markdown}</pre>
        </main>
      </ArtifactFilesProvider>
    </EditorMediaProvider>
  );
}
