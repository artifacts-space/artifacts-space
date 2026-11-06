"use client";

import { Badge } from "@/components/ui/badge";
import { PixelAvatar } from "@/components/pixel-avatar";
import type { VersionSummaryDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { editorName, SavedAt } from "./last-edited";
import { saveKindLabel, versionBadges, versionNote } from "./version-labels";

/** Who saved a version, or a stand-in when they are gone. */
export function VersionAuthor({ version }: { version: VersionSummaryDto }) {
  if (!version.editor) return <span className="font-medium">Former member</span>;
  return <span className="font-medium">{editorName(version.editor)}</span>;
}

function VersionBadges({ version }: { version: VersionSummaryDto }) {
  const badges = versionBadges(version);
  if (badges.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {badges.map((badge) => <Badge key={badge} variant={badge === "Current" ? "secondary" : "outline"}>{badge}</Badge>)}
    </span>
  );
}

interface VersionListProps {
  versions: VersionSummaryDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Every saved version, newest first: who saved it, when, and a short note. */
export function VersionList({ versions, selectedId, onSelect }: VersionListProps) {
  return (
    <ol aria-label="Versions" className="space-y-0.5 p-2">
      {versions.map((version) => (
        <li key={version.id}>
          <button
            type="button"
            onClick={() => { onSelect(version.id); }}
            aria-current={version.id === selectedId ? "true" : undefined}
            className={cn("flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors", version.id === selectedId ? "bg-muted" : "hover:bg-muted/60")}
          >
            <span className="mt-0.5 shrink-0">
              {version.editor ? <PixelAvatar seed={version.editor.id} kind={version.editor.kind} size={20} /> : <span className="block size-5 rounded-full bg-muted" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                <VersionAuthor version={version} />
                <span className="text-xs text-muted-foreground"><SavedAt at={version.savedAt} /></span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {saveKindLabel(version.saveKind)} · {versionNote(version)}
              </span>
              <VersionBadges version={version} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
