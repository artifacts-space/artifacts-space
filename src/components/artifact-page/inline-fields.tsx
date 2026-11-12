"use client";

import { InlineContent } from "@/components/app/artifact-editor/inline-content";
import { EditorLoadingFallback } from "@/components/editor/document-editor";
import { BlockMenuFor } from "@/components/editor/rich/block-menu/block-menu-context";
import { LineField } from "@/components/line-field";

import { usePageEdit } from "./page-edit-context";

/*
 * The parts of an artifact page that unlock for editors: each renders the
 * server's read view (its children) for readers, and an editable field in
 * the same place and type for someone who may edit (page-edit-context.ts).
 */

const titleClass = "text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl";
const summaryClass = "text-md leading-7 text-muted-foreground";

/** The page title: a heading for readers, the same heading as a field for editors. */
export function InlineTitle({ children }: { children: React.ReactNode }) {
  const edit = usePageEdit();
  if (!edit) return <h1 className={titleClass}>{children}</h1>;
  return (
    <h1 className={titleClass}>
      <LineField value={edit.draft.title} onValueChange={(title) => { edit.update("title", title); }} aria-label="Title" placeholder="Untitled artifact" />
    </h1>
  );
}

/**
 * The one-line summary under the title. Editors see a field even when it is
 * empty; a long summary wraps inside the column, as it does for readers.
 */
export function InlineSummary({ children }: { children: React.ReactNode }) {
  const edit = usePageEdit();
  if (!edit) return children;
  return (
    <LineField
      value={edit.draft.summary}
      onValueChange={(summary) => { edit.update("summary", summary); }}
      aria-label="Summary"
      placeholder="Add a one-line summary"
      className={`mt-4 ${summaryClass}`}
    />
  );
}

/**
 * The artifact itself: the read view, or the same content editable in place.
 * A Markdown document gets block handles and the block menu; `canComment`
 * says whether its Comment action may open the comments under the page.
 */
export function InlineBody({ canComment = false, children }: { canComment?: boolean; children: React.ReactNode }) {
  const edit = usePageEdit();
  if (!edit) return children;
  const { artifact, draft, revision, sourceOpen, update, showSource } = edit;
  return (
    // While the rich editor's code loads, the read view stays in place.
    <BlockMenuFor artifact={artifact} canComment={canComment}>
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
    </BlockMenuFor>
  );
}
