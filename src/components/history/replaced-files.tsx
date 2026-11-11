import { IconDownload, IconFile } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { fileTypeLabel, formatBytes } from "@/lib/files/config";
import { oldCopyUrl, type OldFileDto } from "@/lib/files/types";

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
