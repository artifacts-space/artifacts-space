"use client";

import { IconCode } from "@tabler/icons-react";

import { CsvContentEditor } from "@/components/artifact-page/csv-content-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { ContentStatus } from "@/components/editor/content-status";
import { DocumentEditor, isDocumentKind, type DocumentKind } from "@/components/editor/document-editor";
import { InlineCommentSurface } from "@/components/inline-comments/inline-comment-surface";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { canEditBlocks, UiBlockEditor } from "@/components/ui-editor/ui-block-editor";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { editColumnClass, bodyFillsColumnClass } from "@/lib/page-width/rules";
import type { Theme } from "@/lib/themes/schema";
import { cn } from "@/lib/utils";

import { gutterRoom } from "./detail-scroll";
import { isThemed, PreviewSurface, surfaceClass } from "./preview-surface";

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
 * (PageColumn) unless the artifact is full width, inside a ThemeScope that
 * spans the pane with the artifact's theme, as on its page. On the
 * artifact's own page (`surface="page"`) the content sits on the page as
 * readers see it, inside the page's own theme scope, and source sits in a
 * card.
 */

/** Where the content is edited: the /app pane, or the artifact's own page. */
export type InlineSurface = "pane" | "page";

/** Where and how the content sits: the surface, the Full width setting, and the theme it renders with. */
interface Placement {
  surface: InlineSurface;
  fullWidth: boolean;
  theme: Theme | null;
}

/**
 * The rendered content's frame: the pane's themed surface with the page
 * column inside it, or the page's own column. In the pane it leaves the
 * block gutter an interface has (gutterRoom), as the title rows above do.
 */
function ContentFrame({ place, children }: { place: Placement; children: React.ReactNode }) {
  const { surface, fullWidth, theme } = place;
  if (surface === "page") return <div className={cn("min-w-0", bodyFillsColumnClass)} data-full-width={fullWidth}>{children}</div>;
  return <PreviewSurface theme={theme} fullWidth={fullWidth} className={cn("py-5 sm:py-8", gutterRoom)}>{children}</PreviewSurface>;
}

/** The source field's frame: a card on the artifact page; in /app, the theme across the pane around the page column (the whole pane when full width). */
function SourceFrame({ place, children }: { place: Placement; children: React.ReactNode }) {
  const { surface, fullWidth, theme } = place;
  if (surface === "page") return <div className="card-surface flex flex-col overflow-hidden" data-full-width={fullWidth}>{children}</div>;
  return (
    <ThemeScope theme={theme} className={cn("flex flex-[1_0_auto] flex-col text-foreground", gutterRoom, isThemed(theme) && "bg-background")} data-content-theme="">
      <div className={cn("flex flex-1 flex-col", editColumnClass(fullWidth))} data-full-width={fullWidth}>{children}</div>
    </ThemeScope>
  );
}

const sourceField = "min-h-[460px] flex-1 resize-y rounded-none border-0 font-mono text-base leading-7 md:text-sm shadow-none outline-none focus-visible:ring-0";

/**
 * The source field's padding. In the pane its sides are the page column's
 * own padding (px-6 in pageColumnClass), so the source starts and ends where
 * the title above it does; on the artifact page the field is a card with
 * its own room.
 */
function sourcePadding(surface: InlineSurface): string {
  return surface === "pane" ? "px-6 py-6 sm:py-8" : "p-6 sm:p-8";
}

/** The side padding of the status line under the source: the source field's own, so the two start at the same place. */
function statusPadding(surface: InlineSurface): string {
  return surface === "pane" ? "px-6" : "px-6 sm:px-8";
}

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
  /** The theme the artifact renders with in the /app pane (useRenderTheme). Null draws it in the site theme; the artifact page themes itself. */
  theme?: Theme | null;
  onChange: (content: string) => void;
  onShowSource: () => void;
}

/** The raw content, for View source and for code. Spell check only for prose. */
function SourceEditor({ kind, content, label, place, onChange }: { kind: ArtifactKind; content: string; label: string; place: Placement; onChange: (content: string) => void }) {
  return (
    <SourceFrame place={place}>
      <Textarea
        value={content}
        onChange={(event) => { onChange(event.target.value); }}
        aria-label={label}
        spellCheck={isDocumentKind(kind)}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn(sourceField, sourcePadding(place.surface), place.surface === "pane" ? surfaceClass(place.theme) : "bg-card")}
      />
      <ContentStatus kind={kind} content={content} className={statusPadding(place.surface)} />
    </SourceFrame>
  );
}

/** The rendered view for formats edited through View source, with a quiet way into it. */
function RenderedWithSource({ kind, content, language, title, files, place, onShowSource }: Pick<InlineContentProps, "kind" | "content" | "language" | "title" | "files" | "onShowSource"> & { place: Placement }) {
  return (
    <ContentFrame place={place}>
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

/**
 * A Markdown or Text artifact as a document you type into. A Markdown
 * document's words take inline comments; plain text is a native field,
 * whose text cannot be highlighted.
 */
function DocumentContent({ kind, content, revision, place, onChange, onShowSource }: Pick<InlineContentProps, "content" | "revision" | "onChange" | "onShowSource"> & { kind: DocumentKind; place: Placement }) {
  const document = <DocumentEditor key={revision} kind={kind} value={content} onChange={onChange} label="Artifact content" sourceToggle={false} onEditSource={onShowSource} />;
  return <ContentFrame place={place}>{kind === "markdown" ? <InlineCommentSurface>{document}</InlineCommentSurface> : document}</ContentFrame>;
}

/** See the notes at the top of this file. */
export function InlineContent(props: InlineContentProps) {
  const { kind, content, title, files, revision, sourceOpen, surface = "pane", fullWidth = false, theme = null, onChange, onShowSource } = props;
  const place: Placement = { surface, fullWidth, theme };
  if (sourceOpen) return <SourceEditor kind={kind} content={content} label="Artifact source" place={place} onChange={onChange} />;
  if (kind === "code") return <SourceEditor kind={kind} content={content} label="Artifact content" place={place} onChange={onChange} />;
  if (isDocumentKind(kind)) return <DocumentContent kind={kind} content={content} revision={revision} place={place} onChange={onChange} onShowSource={onShowSource} />;
  if (kind === "csv") {
    return (
      <ContentFrame place={place}>
        <CsvContentEditor key={revision} value={content} onChange={onChange} title={title} files={files} label="Artifact content" />
      </ContentFrame>
    );
  }
  if (kind === "ui" && canEditBlocks(content)) {
    return (
      <ContentFrame place={place}>
        <UiBlockEditor content={content} onChange={onChange} />
      </ContentFrame>
    );
  }
  return <RenderedWithSource kind={kind} content={content} language={props.language} title={title} files={files} place={place} onShowSource={onShowSource} />;
}
