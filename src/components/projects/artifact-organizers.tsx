"use client";

import { useEffect, useRef } from "react";

import { formatInfo } from "@/lib/artifact-formats";
import { kindColors, kindIcons, showsFormatChip } from "@/lib/artifact-kinds";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { TagsInput } from "@/components/tags/tags-input";

import { ProjectPicker } from "./project-picker";

interface ArtifactOrganizersProps {
  artifact: ArtifactDto;
  /** The format the editor shows now: the draft's, which can run ahead of the stored one. */
  kind: ArtifactKind;
  /** Opens Format and language, from the format chip. Markdown shows no chip; the More menu opens it for every format. */
  onChangeFormat: () => void;
  onUpdated: (artifact: ArtifactDto) => void;
  /** The content's column (previewColumnClass), so the chips line up with the title. */
  column: string;
  className?: string;
  /** A new artifact not stored yet has no project or tags to change. */
  hidden?: boolean;
}

/** The format as a chip in its colour; choosing it opens Format and language. */
export function KindChip({ kind, onChange }: { kind: ArtifactKind; onChange?: () => void }) {
  const KindIcon = kindIcons[kind];
  const label = formatInfo[kind].label;
  const chip = "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-sm font-medium";
  if (!onChange) return <span className={cn(chip, kindColors[kind])}><KindIcon aria-hidden className="size-3.5" /> {label}</span>;
  return (
    <button type="button" onClick={onChange} aria-label={`Format: ${label}. Change format`} title="Change format and language" className={cn(chip, kindColors[kind], "transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}>
      <KindIcon aria-hidden className="size-3.5" /> {label}
    </button>
  );
}

/**
 * The chips under an artifact's title in the workspace editor: its format
 * (not for Markdown, showsFormatChip), its project, and its tags. Project and tag changes save at once and never
 * touch the editor's draft or history.
 */
export function ArtifactOrganizers({ artifact, kind, onChangeFormat, onUpdated, column, className, hidden = false }: ArtifactOrganizersProps) {
  // A save can finish after the editor moved on; merge into the newest artifact, not the one from the click.
  const latest = useRef(artifact);
  useEffect(() => { latest.current = artifact; }, [artifact]);
  if (hidden) return null;
  return (
    <div className={cn("pt-3 pb-1", className)}>
      <div className={cn("flex flex-wrap items-center gap-2", column)}>
        {showsFormatChip(kind) ? <KindChip kind={kind} onChange={onChangeFormat} /> : null}
        <ProjectPicker artifactId={artifact.id} value={artifact.project} appearance="chip" onChange={(project) => { onUpdated({ ...latest.current, project }); }} />
        <TagsInput artifactId={artifact.id} value={artifact.tags} appearance="chip" onChange={(tags) => { onUpdated({ ...latest.current, tags }); }} />
      </div>
    </div>
  );
}
