"use client";

import { IconExternalLink, IconFileCode, IconFileText, IconLoader2, IconReplace, IconTrash, IconX } from "@tabler/icons-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { fileTypeLabel, formatBytes } from "@/lib/files/config";
import { fileUrl, type FileDto } from "@/lib/files/types";

/** A long list stays light: the browser skips laying out rows that are far off screen. */
export const lightRow = "[content-visibility:auto] [contain-intrinsic-size:auto_3rem]";

interface PageFileRowProps {
  file: FileDto & { pagePath: string };
  removing: boolean;
  busy: boolean;
  onReplace: () => void;
  onRemove: () => void;
}

/** One file of the page: its path, type, and size, and Copy path, Open, Replace (a new file at the same path), and Remove. */
export function PageFileRow({ file, removing, busy, onReplace, onRemove }: PageFileRowProps) {
  return (
    <li className={`card-nested flex min-w-0 items-center gap-3 bg-card px-3 py-2 ${lightRow}`} data-slot="page-file-row">
      <IconFileCode aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-sm">{file.pagePath}</span>
        <span className="text-xs text-muted-foreground">{fileTypeLabel(file.contentType)} · {formatBytes(file.size)}</span>
      </span>
      <CopyButton value={file.pagePath} label="Copy path" variant="ghost" size="xs" />
      <Button variant="ghost" size="icon-xs" nativeButton={false} render={<a href={fileUrl(file.id, { replacedAt: file.replacedAt })} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.pagePath}`} />}>
        <IconExternalLink />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Replace ${file.pagePath}`} title="Replace with a new file at the same path" disabled={busy} onClick={onReplace}>
        <IconReplace />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.pagePath}`} disabled={removing || busy} onClick={onRemove}>
        {removing ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
      </Button>
    </li>
  );
}

/** A file of a drop that is not added, and why. */
export interface RefusedFile {
  key: string;
  name: string;
  problem: string;
}

/** A refused file: its name and the reason, with Remove. It never uploads. */
export function RefusedRow({ file, onRemove }: { file: RefusedFile; onRemove: () => void }) {
  return (
    <li className="card-nested flex min-w-0 flex-col gap-1 bg-card px-3 py-2" data-slot="page-refused-row">
      <div className="flex min-w-0 items-center gap-2">
        <IconFileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.name}`} onClick={onRemove}><IconX /></Button>
      </div>
      <p role="alert" className="text-xs break-words text-tone-danger">{file.problem}</p>
    </li>
  );
}

/** The index.html of a dropped folder. */
export interface PageHtmlFile {
  key: string;
  file: File;
  /** Why its text cannot be the page, once read. */
  problem: string | null;
}

/** The page itself, found in a drop: "This is the page itself", and one way to use it. */
export function PageHtmlRow({ entry, busy, onUse, onLeaveOut }: { entry: PageHtmlFile; busy: boolean; onUse: () => void; onLeaveOut: () => void }) {
  return (
    <li className="card-nested flex min-w-0 flex-col gap-1.5 bg-card px-3 py-2" data-slot="page-html-row">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <IconFileCode aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-sm">{entry.file.name}</span>
          <span className="text-xs text-muted-foreground">This is the page itself · {formatBytes(entry.file.size)}</span>
        </span>
        <Button type="button" variant="outline" size="xs" disabled={busy} onClick={onUse}>Use as this page&apos;s HTML</Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Leave out ${entry.file.name}`} onClick={onLeaveOut}><IconX /></Button>
      </div>
      {entry.problem ? <p role="alert" className="text-xs break-words text-tone-danger">{entry.problem}</p> : null}
    </li>
  );
}
