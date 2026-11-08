"use client";

import { IconCode } from "@tabler/icons-react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { CsvContentEditor } from "@/components/artifact-page/csv-content-editor";
import { ContentStatus } from "@/components/editor/content-status";
import { DocumentEditor, isDocumentKind } from "@/components/editor/document-editor";
import { PageColumn } from "@/components/page-width/page-column";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { canEditBlocks, UiBlockEditor } from "@/components/ui-editor/ui-block-editor";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { editColumnClass, readingMeasureClass } from "@/lib/page-width/rules";
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
 * and fields below, and the content keeps to the public page's column
 * (PageColumn) unless the artifact is full width. On the artifact's own page
 * (`surface="page"`) the content sits on the page as readers see it, and
 * source sits in a card.
 */

/** Where the content is edited: the /app pane, or the artifact's own page. */
export type InlineSurface = "pane" | "page";

/** The source field's frame: the page column (or the whole pane when full width) in /app, a card on the artifact page. */
function sourceFrame(surface: InlineSurface, fullWidth: boolean): string {
  if (surface === "page") return "card-surface flex flex-col overflow-hidden";
  return cn("flex flex-[1_0_auto] flex-col", editColumnClass(fullWidth));
}

/**
 * The rendered content's frame: the pane's card with the page column inside
 * it, or the page's own column. `gutter` keeps room on both sides of the
 * pane's column for the interface editor's block handles, which hang left of
 * each block; both sides, so the column stays centered.
 */
function ContentFrame({ surface, fullWidth, gutter = false, children }: { surface: InlineSurface; fullWidth: boolean; gutter?: boolean; children: React.ReactNode }) {
  if (surface === "page") return <div className={cn("min-w-0", readingMeasureClass(fullWidth))} data-full-width={fullWidth}>{children}</div>;
  return (
    <div className={cn("min-h-[460px] min-w-0 flex-[1_0_auto] bg-card py-5 sm:py-8", gutter && "sm:px-14")} data-full-width={fullWidth}>
      <PageColumn fullWidth={fullWidth}>{children}</PageColumn>
    </div>
  );
}
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
  /** The artifact's "Full width" setting: in the /app pane the content spans the pane instead of the page column. The artifact page sets its own column. */
  fullWidth?: boolean;
  onChange: (content: string) => void;
  onShowSource: () => void;
}

/** The raw content, for View source and for code. Spell check only for prose. */
function SourceEditor({ kind, content, label, frame, fullWidth, onChange }: { kind: ArtifactKind; content: string; label: string; frame: string; fullWidth: boolean; onChange: (content: string) => void }) {
  return (
    <div className={frame} data-full-width={fullWidth}>
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
function RenderedWithSource({ kind, content, language, title, files, surface, fullWidth, onShowSource }: Omit<InlineContentProps, "revision" | "sourceOpen" | "onChange" | "surface" | "fullWidth"> & { surface: InlineSurface; fullWidth: boolean }) {
  return (
    <ContentFrame surface={surface} fullWidth={fullWidth}>
      <div className="mb-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onShowSource} className="text-muted-foreground">
          <IconCode aria-hidden /> Edit source
        </Button>
      </div>
      <ArtifactView kind={kind} content={content} language={language} title={title} files={files} />
    </ContentFrame>
  );
}

/** True when the content shows an editable field to focus; otherwise the pane takes focus for keyboard scrolling. */
export function hasInlineField(kind: ArtifactKind, sourceOpen: boolean): boolean {
  return sourceOpen || kind === "code" || kind === "csv" || kind === "ui" || isDocumentKind(kind);
}

/** See the notes at the top of this file. */
export function InlineContent(props: InlineContentProps) {
  const { kind, content, title, files, revision, sourceOpen, surface = "pane", fullWidth = false, onChange, onShowSource } = props;
  const source = sourceFrame(surface, fullWidth);
  if (sourceOpen) return <SourceEditor kind={kind} content={content} label="Artifact source" frame={source} fullWidth={fullWidth} onChange={onChange} />;
  if (kind === "code") return <SourceEditor kind={kind} content={content} label="Artifact content" frame={source} fullWidth={fullWidth} onChange={onChange} />;
  if (isDocumentKind(kind)) {
    return (
      <ContentFrame surface={surface} fullWidth={fullWidth}>
        <DocumentEditor key={revision} kind={kind} value={content} onChange={onChange} label="Artifact content" sourceToggle={false} onEditSource={onShowSource} />
      </ContentFrame>
    );
  }
  if (kind === "csv") {
    return (
      <ContentFrame surface={surface} fullWidth={fullWidth}>
        <CsvContentEditor key={revision} value={content} onChange={onChange} title={title} files={files} label="Artifact content" />
      </ContentFrame>
    );
  }
  if (kind === "ui" && canEditBlocks(content)) {
    return (
      <ContentFrame surface={surface} fullWidth={fullWidth} gutter>
        <UiBlockEditor content={content} onChange={onChange} />
      </ContentFrame>
    );
  }
  return <RenderedWithSource kind={kind} content={content} language={props.language} title={title} files={files} surface={surface} fullWidth={fullWidth} onShowSource={onShowSource} />;
}
