"use client";

import { InlineContent } from "@/components/app/artifact-editor/inline-content";
import { EditorLoadingFallback } from "@/components/editor/document-editor";

import { usePageEdit } from "./page-edit-context";

/*
 * The parts of an artifact page that unlock for editors: each renders the
 * server's read view (its children) for readers, and an editable field in
 * the same place and type for someone who may edit (page-edit-context.ts).
 */

const titleClass = "text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl";
const summaryClass = "max-w-2xl text-md leading-7 text-muted-foreground";

/** Titles are one line: Enter never adds a break, and pasted breaks become spaces. */
function singleLine(value: string) {
  return value.replace(/\s*[\r\n]+\s*/g, " ");
}

/** The page title: a heading for readers, the same heading as a field for editors. */
export function InlineTitle({ children }: { children: React.ReactNode }) {
  const edit = usePageEdit();
  if (!edit) return <h1 className={titleClass}>{children}</h1>;
  return (
    <h1 className={titleClass}>
      <textarea
        value={edit.draft.title}
        rows={1}
        onChange={(event) => { edit.update("title", singleLine(event.target.value)); }}
        onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        aria-label="Title"
        placeholder="Untitled artifact"
        className="block w-full resize-none overflow-hidden bg-transparent field-sizing-content outline-none placeholder:text-muted-foreground/60"
      />
    </h1>
  );
}

/** The one-line summary under the title. Editors see a field even when it is empty. */
export function InlineSummary({ children }: { children: React.ReactNode }) {
  const edit = usePageEdit();
  if (!edit) return children;
  return (
    <input
      value={edit.draft.summary}
      onChange={(event) => { edit.update("summary", event.target.value); }}
      aria-label="Summary"
      placeholder="Add a one-line summary"
      className={`mt-4 block w-full bg-transparent outline-none placeholder:text-muted-foreground/60 ${summaryClass}`}
    />
  );
}

/** The artifact itself: the read view, or the same content editable in place. */
export function InlineBody({ children }: { children: React.ReactNode }) {
  const edit = usePageEdit();
  if (!edit) return children;
  const { artifact, draft, revision, sourceOpen, update, showSource } = edit;
  return (
    // While the rich editor's code loads, the read view stays in place.
    <EditorLoadingFallback value={children}>
      <InlineContent
        surface="page"
        kind={draft.kind}
        content={draft.content}
        language={draft.language}
        title={draft.title}
        files={artifact.files}
        revision={revision}
        sourceOpen={sourceOpen}
        onChange={(content) => { update("content", content); }}
        onShowSource={showSource}
      />
    </EditorLoadingFallback>
  );
}
