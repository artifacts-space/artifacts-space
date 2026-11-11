"use client";

import { IconDownload, IconFile } from "@tabler/icons-react";
import { useMemo, type ReactNode } from "react";

import { ArtifactFilesProvider, type FileUrlBuilder } from "@/components/artifact-view/files-context";
import { Button } from "@/components/ui/button";
import { fileTypeLabel, formatBytes } from "@/lib/files/config";
import { fileUrl, oldCopyUrl, type FileDto, type OldFileDto } from "@/lib/files/types";

/**
 * In History, the files a replace has changed since this version, as they
 * were then, each with a download. Restore brings back the text, not these
 * files, so this is where the older copies are. Only people who may edit
 * the artifact see History, and the download checks that again.
 */
export function ReplacedFiles({ files }: { files: readonly OldFileDto[] }) {
  if (files.length === 0) return null;
  return (
    <section aria-label="Files replaced since this version" className="mb-4 flex flex-col gap-2" data-slot="replaced-files">
      <h3 className="text-sm font-medium">Files replaced since this version</h3>
      <p className="text-xs text-muted-foreground">The artifact shows the newer files. Download a copy as it was then.</p>
      <ul className="flex min-w-0 flex-col gap-2">
        {files.map((file) => (
          <li key={file.copyId} className="card-nested flex min-w-0 items-center gap-3 bg-card px-3 py-2">
            <IconFile aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{file.filename}</span>
              <span className="text-xs text-muted-foreground">{fileTypeLabel(file.contentType)} · {formatBytes(file.size)}</span>
            </span>
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={oldCopyUrl(file, { download: true })} download aria-label={`Download ${file.filename} as it was then`} />}>
              <IconDownload /> Download
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The files a version's preview shows: the artifact's files, with each one
 * replaced since that version shown as it was then, and opened from its old
 * copy (editors only, like History itself). The current version previews
 * the current files.
 */
export function VersionFiles({ files, replacedSince, children }: { files: readonly FileDto[]; replacedSince: readonly OldFileDto[]; children: ReactNode }) {
  const value = useMemo(() => {
    const copies = new Map(replacedSince.map((copy) => [copy.fileId, copy]));
    const shown = files.map((file) => {
      const copy = copies.get(file.id);
      return copy ? { ...file, filename: copy.filename, contentType: copy.contentType, size: copy.size } : file;
    });
    const urlFor: FileUrlBuilder = (fileId, download) => {
      const copy = copies.get(fileId);
      return copy ? oldCopyUrl(copy, { download }) : fileUrl(fileId, { download, replacedAt: files.find((file) => file.id === fileId)?.replacedAt });
    };
    return { shown, urlFor };
  }, [files, replacedSince]);
  return <ArtifactFilesProvider files={value.shown} urlFor={value.urlFor}>{children}</ArtifactFilesProvider>;
}
