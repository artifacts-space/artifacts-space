"use client";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ContentStatus } from "@/components/editor/content-status";
import { Textarea } from "@/components/ui/textarea";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

import type { ArtifactDraft } from "./use-artifact-draft";

export type EditorMode = "edit" | "preview";
type UpdateDraft = <K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => void;

function isProse(kind: ArtifactKind) {
  return kind === "markdown" || kind === "text";
}

interface ContentPaneProps {
  mode: EditorMode;
  kind: ArtifactKind;
  content: string;
  language: string;
  title: string;
  files: readonly FileDto[];
  update: UpdateDraft;
}

/**
 * The content textarea in edit mode, or the rendered artifact in preview mode.
 * Both grow to fill the pane but never shrink below their content
 * (`flex-[1_0_auto]`): inside the /app shell the pane has a fixed height, and
 * a shrinkable `flex-1` box stopped at its 460px minimum while the content
 * spilled over the files, Format/Language, and comments below it.
 */
export function ContentPane({ mode, kind, content, language, title, files, update }: ContentPaneProps) {
  if (mode === "edit") {
    return (
      <div className="flex flex-[1_0_auto] flex-col">
        <Textarea
          value={content}
          onChange={(event) => { update("content", event.target.value); }}
          aria-label="Artifact content"
          spellCheck={isProse(kind)}
          className="min-h-[460px] flex-1 resize-y rounded-none border-0 bg-card p-6 font-mono text-base leading-7 md:text-sm shadow-none outline-none focus-visible:ring-0 sm:p-8"
        />
        <ContentStatus kind={kind} content={content} />
      </div>
    );
  }
  return (
    <div className="min-h-[460px] min-w-0 flex-[1_0_auto] bg-card p-5 sm:p-8">
      <ArtifactView kind={kind} content={content} language={language} title={title} files={files} />
    </div>
  );
}
