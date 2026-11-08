"use client";

import { IconCode } from "@tabler/icons-react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { CsvContentEditor } from "@/components/artifact-page/csv-content-editor";
import { ContentStatus } from "@/components/editor/content-status";
import { DocumentEditor, isDocumentKind } from "@/components/editor/document-editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

/**
 * The artifact's content in the /app editor, rendered as itself and editable
 * in place. Markdown and Text are documents you type into; CSV is a grid;
 * Code is its source. Formats without an inline editor yet (ui, JSON, SVG,
 * Mermaid, File notes) show their rendered view, and View source edits them.
 * Every surface grows to fill the pane but never shrinks below its content
 * (`flex-[1_0_auto]`), so nothing spills over the files and fields below.
 */

const pagePane = "min-h-[460px] min-w-0 flex-[1_0_auto] bg-card p-5 sm:p-8";
const sourceField =
  "min-h-[460px] flex-1 resize-y rounded-none border-0 bg-card p-6 font-mono text-base leading-7 md:text-sm shadow-none outline-none focus-visible:ring-0 sm:p-8";

interface InlineContentProps {
  kind: ArtifactKind;
  content: string;
  language: string;
  title: string;
  files: readonly FileDto[];
  /** Changes when the content was replaced from outside, so stateful editors reload it. */
  revision: number;
  /** View source is open: the raw content replaces the page. */
  sourceOpen: boolean;
  onChange: (content: string) => void;
  onShowSource: () => void;
}

/** The raw content, for View source and for code. Spell check only for prose. */
function SourceEditor({ kind, content, label, onChange }: { kind: ArtifactKind; content: string; label: string; onChange: (content: string) => void }) {
  return (
    <div className="flex flex-[1_0_auto] flex-col">
      <Textarea
        value={content}
        onChange={(event) => { onChange(event.target.value); }}
        aria-label={label}
        spellCheck={isDocumentKind(kind)}
        autoCapitalize="off"
        autoCorrect="off"
        className={sourceField}
      />
      <ContentStatus kind={kind} content={content} />
    </div>
  );
}

/** The rendered view for formats edited through View source, with a quiet way into it. */
function RenderedWithSource({ kind, content, language, title, files, onShowSource }: Omit<InlineContentProps, "revision" | "sourceOpen" | "onChange">) {
  return (
    <div className={pagePane}>
      <div className="mb-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onShowSource} className="text-muted-foreground">
          <IconCode aria-hidden /> Edit source
        </Button>
      </div>
      <ArtifactView kind={kind} content={content} language={language} title={title} files={files} />
    </div>
  );
}

/** True when the content shows an editable field to focus; otherwise the pane takes focus for keyboard scrolling. */
export function hasInlineField(kind: ArtifactKind, sourceOpen: boolean): boolean {
  return sourceOpen || kind === "code" || kind === "csv" || isDocumentKind(kind);
}

/** See the notes at the top of this file. */
export function InlineContent(props: InlineContentProps) {
  const { kind, content, title, files, revision, sourceOpen, onChange, onShowSource } = props;
  if (sourceOpen) return <SourceEditor kind={kind} content={content} label="Artifact source" onChange={onChange} />;
  if (kind === "code") return <SourceEditor kind={kind} content={content} label="Artifact content" onChange={onChange} />;
  if (isDocumentKind(kind)) {
    return (
      <div className={pagePane}>
        <DocumentEditor key={revision} kind={kind} value={content} onChange={onChange} label="Artifact content" sourceToggle={false} onEditSource={onShowSource} />
      </div>
    );
  }
  if (kind === "csv") {
    return (
      <div className={pagePane}>
        <CsvContentEditor key={revision} value={content} onChange={onChange} title={title} files={files} label="Artifact content" />
      </div>
    );
  }
  return <RenderedWithSource {...props} />;
}
