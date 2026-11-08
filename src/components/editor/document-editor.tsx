"use client";

import dynamic from "next/dynamic";

import type { ArtifactKind } from "@/lib/artifact-types";

/** A quiet stand-in with the editor's height while the editor code loads. */
function EditorLoading() {
  return (
    <div role="status" aria-label="Loading the editor" className="min-h-[50dvh] pt-12">
      <div className="h-4 w-2/3 max-w-[var(--artifact-measure,72ch)] animate-pulse rounded-sm bg-muted" />
      <div className="mt-3 h-4 w-1/2 max-w-[var(--artifact-measure,72ch)] animate-pulse rounded-sm bg-muted" />
    </div>
  );
}

/** The rich editor and its Tiptap code load only when someone edits a Markdown artifact. */
const RichMarkdownEditor = dynamic(() => import("./rich-markdown-editor"), { ssr: false, loading: () => <EditorLoading /> });

/** Formats edited as a document in place, instead of source with a preview. */
export type DocumentKind = "markdown" | "text";

/** True for the formats `DocumentEditor` edits: Markdown and plain text. */
export function isDocumentKind(kind: ArtifactKind): kind is DocumentKind {
  return kind === "markdown" || kind === "text";
}

interface DocumentEditorProps {
  kind: DocumentKind;
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoFocus?: boolean;
  /** Markdown only: show the editor's own Markdown source switch. The /app editor keeps the source behind View source instead. */
  sourceToggle?: boolean;
  /** Markdown only: opens the source when a part can only be edited as Markdown. */
  onEditSource?: () => void;
}

/**
 * Plain text, edited as it reads: the same size and line length as the
 * text view, in a native field that keeps every space and line break.
 */
function PlainTextEditor({ value, onChange, label, autoFocus = false }: Omit<DocumentEditorProps, "kind" | "sourceToggle" | "onEditSource">) {
  return (
    <textarea
      value={value}
      onChange={(event) => { onChange(event.target.value); }}
      aria-label={label}
      autoFocus={autoFocus}
      spellCheck
      placeholder="Start writing"
      className="block min-h-[50dvh] w-full max-w-[var(--artifact-measure,72ch)] resize-none field-sizing-content bg-transparent text-base leading-7 break-words whitespace-pre-wrap outline-none placeholder:text-muted-foreground/60 md:text-md"
    />
  );
}

/**
 * Edits Markdown and Text artifacts in place, as documents. Markdown gets the
 * rich editor (loaded on demand); Text gets a plain field with no formatting.
 */
export function DocumentEditor({ kind, ...props }: DocumentEditorProps) {
  if (kind === "markdown") return <RichMarkdownEditor {...props} />;
  return <PlainTextEditor value={props.value} onChange={props.onChange} label={props.label} autoFocus={props.autoFocus ?? false} />;
}
