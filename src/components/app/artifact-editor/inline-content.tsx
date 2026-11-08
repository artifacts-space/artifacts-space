"use client";

import { IconCode } from "@tabler/icons-react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { CsvContentEditor } from "@/components/artifact-page/csv-content-editor";
import { ContentStatus } from "@/components/editor/content-status";
import { DocumentEditor, isDocumentKind } from "@/components/editor/document-editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { canEditBlocks, UiBlockEditor } from "@/components/ui-editor/ui-block-editor";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { cn } from "@/lib/utils";

/**
 * The artifact's content in the /app editor, rendered as itself and editable
 * in place. Markdown and Text are documents you type into; CSV is a grid;
 * Code is its source; an interface opens in the block editor
 * (src/components/ui-editor). Formats without an inline editor yet (JSON,
 * SVG, Mermaid, File notes, and an interface too broken to render) show
 * their rendered view, and View source edits them.
 * In the /app pane every surface grows to fill the pane but never shrinks
 * below its content (`flex-[1_0_auto]`), so nothing spills over the files
 * and fields below. On the artifact's own page (`surface="page"`) the
 * content sits on the page as readers see it, and source sits in a card.
 */

/** Where the content is edited: the /app pane, or the artifact's own page. */
export type InlineSurface = "pane" | "page";

const pagePane = "min-h-[460px] min-w-0 flex-[1_0_auto] bg-card p-5 sm:p-8";
/** `gutter`: room on the left for the interface editor's block handles. */
const frames: Record<InlineSurface, { content: string; source: string; gutter: string }> = {
  pane: { content: pagePane, source: "flex flex-[1_0_auto] flex-col", gutter: "sm:pl-14" },
  page: { content: "min-w-0", source: "card-surface flex flex-col overflow-hidden", gutter: "" },
};
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
  /** Defaults to the /app pane. */
  surface?: InlineSurface;
  onChange: (content: string) => void;
  onShowSource: () => void;
}

/** The raw content, for View source and for code. Spell check only for prose. */
function SourceEditor({ kind, content, label, frame, onChange }: { kind: ArtifactKind; content: string; label: string; frame: string; onChange: (content: string) => void }) {
  return (
    <div className={frame}>
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
function RenderedWithSource({ kind, content, language, title, files, frame, onShowSource }: Omit<InlineContentProps, "revision" | "sourceOpen" | "onChange" | "surface"> & { frame: string }) {
  return (
    <div className={frame}>
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
  return sourceOpen || kind === "code" || kind === "csv" || kind === "ui" || isDocumentKind(kind);
}

/** See the notes at the top of this file. */
export function InlineContent(props: InlineContentProps) {
  const { kind, content, title, files, revision, sourceOpen, surface = "pane", onChange, onShowSource } = props;
  const frame = frames[surface];
  if (sourceOpen) return <SourceEditor kind={kind} content={content} label="Artifact source" frame={frame.source} onChange={onChange} />;
  if (kind === "code") return <SourceEditor kind={kind} content={content} label="Artifact content" frame={frame.source} onChange={onChange} />;
  if (isDocumentKind(kind)) {
    return (
      <div className={frame.content}>
        <DocumentEditor key={revision} kind={kind} value={content} onChange={onChange} label="Artifact content" sourceToggle={false} onEditSource={onShowSource} />
      </div>
    );
  }
  if (kind === "csv") {
    return (
      <div className={frame.content}>
        <CsvContentEditor key={revision} value={content} onChange={onChange} title={title} files={files} label="Artifact content" />
      </div>
    );
  }
  if (kind === "ui" && canEditBlocks(content)) {
    return (
      <div className={cn(frame.content, frame.gutter)}>
        <UiBlockEditor content={content} onChange={onChange} />
      </div>
    );
  }
  return <RenderedWithSource kind={kind} content={content} language={props.language} title={title} files={files} frame={frame.content} onShowSource={onShowSource} />;
}
