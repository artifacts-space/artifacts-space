"use client";

import { useState } from "react";

import { TagsInput } from "@/components/tags/tags-input";
import type { ArtifactProjectDto } from "@/lib/artifact-types";

import { ProjectPicker } from "./project-picker";

interface PageOrganizersProps {
  /** The artifact's internal id. */
  artifactId: string;
  project: ArtifactProjectDto | null;
  tags: string[];
}

/**
 * The project and tag controls under the summary on an artifact's page. The
 * page renders them only for the author and members of the team it is
 * shared through; everyone else never receives the project or tags at all.
 */
export function PageOrganizers({ artifactId, project: initialProject, tags: initialTags }: PageOrganizersProps) {
  const [project, setProject] = useState(initialProject);
  const [tags, setTags] = useState(initialTags);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <ProjectPicker artifactId={artifactId} value={project} onChange={setProject} />
      <TagsInput artifactId={artifactId} value={tags} onChange={setTags} />
    </div>
  );
}
