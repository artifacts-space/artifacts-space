import { IconDownload, IconFile } from "@tabler/icons-react";

import { formatBytes } from "@/lib/files/config";

/** A download card: icon, name, type and size, and a download link. Server-safe. */
export function FileCard({ name, detail, size, href }: { name: string; detail: string | null; size: number | null; href: string }) {
  const facts = [detail, size === null ? null : formatBytes(size)].filter(Boolean).join(" · ");
  return (
    <a
      href={href}
      download
      className="group flex min-w-0 items-center gap-3 rounded-md border bg-card px-3 py-2.5 text-sm shadow-xs transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <IconFile aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        {facts ? <span className="text-xs text-muted-foreground">{facts}</span> : null}
      </span>
      <IconDownload aria-hidden className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
      <span className="sr-only">Download</span>
    </a>
  );
}
