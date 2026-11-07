"use client";

import { useState } from "react";

import type { ArtifactProjectDto } from "@/lib/artifact-types";

import { ProjectPicker } from "./project-picker";

interface PageOrganizersProps {
  /** The artifact's internal id. */
  artifactId: string;
  project: ArtifactProjectDto | null;
}

/**
 * The project control under the summary on an artifact's page. The page
 * renders it only for the author and members of the team it is shared
 * through; everyone else never receives the project at all.
 */
export function PageOrganizers({ artifactId, project: initial }: PageOrganizersProps) {
  const [project, setProject] = useState(initial);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <ProjectPicker artifactId={artifactId} value={project} onChange={setProject} />
    </div>
  );
}
