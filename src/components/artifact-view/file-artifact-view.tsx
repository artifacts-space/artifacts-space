"use client";

import { fileCategory, fileTypeLabel } from "@/lib/files/config";
import type { FileDto } from "@/lib/files/types";

import { FileCard } from "./file-card";
import { useArtifactFile, useArtifactFiles } from "./files-context";
import { MarkdownView } from "./markdown-view";
import { ViewNotice } from "./view-notice";

const mediaClass = "w-full max-h-[70vh] rounded-md border bg-muted shadow-xs";

/** How one file shows: in the page for images, PDFs, video, and audio, and always with a download card. */
function FilePreview({ file }: { file: FileDto }) {
  const { url, downloadUrl } = useArtifactFile(file.id);
  const category = fileCategory(file.contentType);
  const card = <FileCard name={file.filename} detail={fileTypeLabel(file.contentType)} size={file.size} href={downloadUrl} />;
  if (category === "image") {
    return (
      <figure className="flex min-w-0 flex-col gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize */}
        <img src={url} alt={file.filename} loading="lazy" decoding="async" className="h-auto max-h-[70vh] max-w-full self-start rounded-md border bg-muted object-contain shadow-xs" />
        {card}
      </figure>
    );
  }
  if (category === "pdf") {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <iframe src={url} title={file.filename} loading="lazy" className={`${mediaClass} h-[70vh]`} />
        {card}
      </div>
    );
  }
  if (category === "video") {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <video src={url} controls preload="metadata" className={mediaClass} aria-label={file.filename} />
        {card}
      </div>
    );
  }
  if (category === "audio") {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <audio src={url} controls preload="metadata" className="w-full" aria-label={file.filename} />
        {card}
      </div>
    );
  }
  return card;
}

/**
 * A file artifact: its notes as Markdown, then each file. Images show
 * inline, PDFs in the browser's viewer, video and audio in native players,
 * and everything else as a download card. Every URL is access-checked.
 */
export function FileArtifactView({ notes }: { notes: string }) {
  const files = useArtifactFiles();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {notes.trim() ? <MarkdownView content={notes} /> : null}
      {files === null ? <ViewNotice title="Files show on the artifact page." /> : null}
      {files?.length === 0 ? <ViewNotice title="No files yet." /> : null}
      {files && files.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-6">
          {files.map((file) => (
            <li key={file.id} className="min-w-0"><FilePreview file={file} /></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
