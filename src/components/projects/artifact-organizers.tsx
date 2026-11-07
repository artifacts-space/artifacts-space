"use client";

import type { ArtifactDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { ProjectPicker } from "./project-picker";

interface ArtifactOrganizersProps {
  artifact: ArtifactDto;
  onUpdated: (artifact: ArtifactDto) => void;
  className?: string;
}

/**
 * The project control under an artifact's summary in the workspace editor.
 * Changes save at once and never touch the editor's draft or history.
 */
export function ArtifactOrganizers({ artifact, onUpdated, className }: ArtifactOrganizersProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b px-5 py-1.5 sm:px-7", className)}>
      <ProjectPicker artifactId={artifact.id} value={artifact.project} onChange={(project) => { onUpdated({ ...artifact, project }); }} />
    </div>
  );
}
