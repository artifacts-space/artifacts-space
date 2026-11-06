"use client";

import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { useDeferredValue } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { Textarea } from "@/components/ui/textarea";
import { validateArtifactContent } from "@/lib/artifact-content";
import { formatInfo } from "@/lib/artifact-formats";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

import type { ArtifactDraft } from "./use-artifact-draft";

export type EditorMode = "edit" | "preview";
type UpdateDraft = <K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => void;

/** Formats whose content has rules a person can break while typing. */
const checkedKinds: ReadonlySet<string> = new Set(["json", "csv", "svg", "mermaid", "ui"]);

function isProse(kind: ArtifactKind) {
  return kind === "markdown" || kind === "text";
}

/** A one-line check of the content against its format, shown under the editor. */
function ContentStatus({ kind, content }: { kind: ArtifactKind; content: string }) {
  const deferred = useDeferredValue(content);
  if (!checkedKinds.has(kind) || !deferred.trim()) return null;
  const result = validateArtifactContent(kind, deferred);
  const label = formatInfo[kind].label;
  const firstError = result.issues.find((issue) => issue.severity === "error");
  return (
    <div role="status" className="flex items-start gap-2 border-t bg-background/60 px-5 py-2 text-xs text-muted-foreground sm:px-7">
      {firstError ? (
        <>
          <IconAlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-tone-warning" />
          <span className="min-w-0 break-words">
            {firstError.message}
            {result.issues.length > 1 ? ` (${String(result.issues.length - 1)} more)` : ""}
          </span>
        </>
      ) : (
        <>
          <IconCircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-tone-success" />
          <span>Valid {label}. It is ready to save.</span>
        </>
      )}
    </div>
  );
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

/** The content textarea in edit mode, or the rendered artifact in preview mode. */
export function ContentPane({ mode, kind, content, language, title, files, update }: ContentPaneProps) {
  if (mode === "edit") {
    return (
      <div className="flex flex-1 flex-col">
        <Textarea
          value={content}
          onChange={(event) => { update("content", event.target.value); }}
          aria-label="Artifact content"
          spellCheck={isProse(kind)}
          className="min-h-[460px] flex-1 resize-y rounded-none border-0 bg-card p-6 font-mono text-[12.5px] leading-7 shadow-none outline-none focus-visible:ring-0 sm:p-8"
        />
        <ContentStatus kind={kind} content={content} />
      </div>
    );
  }
  return (
    <div className="min-h-[460px] min-w-0 flex-1 bg-card p-5 sm:p-8">
      <ArtifactView kind={kind} content={content} language={language} title={title} files={files} />
    </div>
  );
}
