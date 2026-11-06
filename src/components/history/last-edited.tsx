"use client";

import { PixelAvatar } from "@/components/pixel-avatar";
import type { ArtifactEditorDto } from "@/lib/artifact-types";
import { formatExactTime, formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import { useNow } from "./use-now";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "@handle" for people and agents with one, else their name. */
export function editorName(editor: ArtifactEditorDto): string {
  return editor.handle ? `@${editor.handle}` : editor.name;
}

/** When something was saved: "2h ago" in the browser, a date while server rendering. */
export function SavedAt({ at }: { at: string }) {
  const now = useNow();
  const date = new Date(at);
  return (
    <time dateTime={at} title={formatExactTime(date)}>
      {now ? formatRelativeTime(date, now) : dateFormat.format(date)}
    </time>
  );
}

/** "Edited by @handle · 2h ago" with the editor's pixel avatar. Just the time when the editor is gone. */
export function LastEdited({ editor, at, className }: { editor: ArtifactEditorDto | null; at: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {editor ? (
        <>
          <PixelAvatar seed={editor.id} kind={editor.kind} size={16} />
          <span className="truncate">
            Edited by <span className="font-medium text-foreground">{editorName(editor)}</span>
          </span>
        </>
      ) : (
        <span>Edited</span>
      )}
      <span aria-hidden>·</span>
      <span className="shrink-0"><SavedAt at={at} /></span>
    </span>
  );
}
