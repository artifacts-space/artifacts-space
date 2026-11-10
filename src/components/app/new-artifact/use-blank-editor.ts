import { useCallback, useRef, type RefObject } from "react";

import type { ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import type { ArtifactDto } from "@/lib/artifact-types";

import { focusContent, useFocusTitle } from "./blank-page-parts";
import { useBlankPage, type BlankPageOptions } from "./use-blank-page";
import { useFirstContent, type FirstContent } from "./use-first-content";

interface BlankEditorOptions {
  blankPage: BlankPageOptions | undefined;
  artifact: ArtifactDto;
  draft: ArtifactDraft;
  replace: (draft: ArtifactDraft, remount: boolean) => void;
  onUpdated: (artifact: ArtifactDto) => void;
  /** The editor's content region, where pasted text counts as first content. */
  body: RefObject<HTMLDivElement | null>;
  sourceOpen: boolean;
  focusRequest: number | undefined;
}

/**
 * Everything the artifact editor adds for the blank page New artifact
 * opens: the create-once save (useBlankPage), the first paste or drop
 * (useFirstContent), and the cursor in the title (useFocusTitle). For any
 * other artifact it is inert.
 */
export function useBlankEditor({ blankPage, artifact, draft, replace, onUpdated, body, sourceOpen, focusRequest }: BlankEditorOptions) {
  const page = useBlankPage(blankPage, { artifact, draft, replace, onUpdated });
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const { onContent } = page;
  const take = useCallback((content: FirstContent) => {
    onContent(content);
    // Pasted writing stays a document: the cursor goes to its end, where typing goes on.
    if ("text" in content) focusContent(body.current, "end");
  }, [onContent, body]);
  const first = useFirstContent({ page: sectionRef, body, enabled: page.eligible && !sourceOpen, onContent: take });
  useFocusTitle(titleRef, sectionRef, focusRequest ?? 0, page.blank);
  const focusBody = useCallback(() => { focusContent(body.current); }, [body]);
  const label = page.blank ? "New artifact" : `Edit ${artifact.title}`;
  // Files added later through the artifact's Files section go through the same store (the fixture's stand-in on /dev/workspace).
  return { page: { ...page, label }, sectionRef, titleRef, dragging: first.dragging, focusBody, filesApi: blankPage?.api };
}
