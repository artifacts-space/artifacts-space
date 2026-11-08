"use client";

import { IconCode } from "@tabler/icons-react";

import { CsvContentEditor } from "@/components/artifact-page/csv-content-editor";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ContentStatus } from "@/components/editor/content-status";
import { DocumentEditor, isDocumentKind } from "@/components/editor/document-editor";
import { Button } from "@/components/ui/button";
import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { Textarea } from "@/components/ui/textarea";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { editColumnClass, readingMeasureClass } from "@/lib/page-width/rules";
import type { Theme } from "@/lib/themes/schema";
import { cn } from "@/lib/utils";

import { isThemed, PreviewSurface, surfaceClass } from "./preview-surface";

/**
 * The artifact's content in the /app editor, rendered as itself and editable
 * in place. Markdown and Text are documents you type into; CSV is a grid;
 * Code is its source. Formats without an inline editor yet (ui, JSON, SVG,
 * Mermaid, File notes) show their rendered view, and View source edits them.
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

/** The rendered content's frame: the pane's themed surface with the page column inside it, or the page's own column. */
function ContentFrame({ place, children }: { place: Placement; children: React.ReactNode }) {
  const { surface, fullWidth, theme } = place;
  if (surface === "page") return <div className={cn("min-w-0", readingMeasureClass(fullWidth))} data-full-width={fullWidth}>{children}</div>;
  return <PreviewSurface theme={theme} fullWidth={fullWidth} className="py-5 sm:py-8">{children}</PreviewSurface>;
}

/** The source field's frame: a card on the artifact page; in /app, the theme across the pane around the page column (the whole pane when full width). */
function SourceFrame({ place, children }: { place: Placement; children: React.ReactNode }) {
  const { surface, fullWidth, theme } = place;
  if (surface === "page") return <div className="card-surface flex flex-col overflow-hidden" data-full-width={fullWidth}>{children}</div>;
  return (
    <ThemeScope theme={theme} className={cn("flex flex-[1_0_auto] flex-col text-foreground", isThemed(theme) && "bg-background")} data-content-theme="">
      <div className={cn("flex flex-1 flex-col", editColumnClass(fullWidth))} data-full-width={fullWidth}>{children}</div>
    </ThemeScope>
  );
}

const sourceField =
  "min-h-[460px] flex-1 resize-y rounded-none border-0 p-6 font-mono text-base leading-7 md:text-sm shadow-none outline-none focus-visible:ring-0 sm:p-8";

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
        className={cn(sourceField, place.surface === "pane" ? surfaceClass(place.theme) : "bg-card")}
      />
      <ContentStatus kind={kind} content={content} />
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
  return sourceOpen || kind === "code" || kind === "csv" || isDocumentKind(kind);
}

/** See the notes at the top of this file. */
export function InlineContent(props: InlineContentProps) {
  const { kind, content, title, files, revision, sourceOpen, surface = "pane", fullWidth = false, theme = null, onChange, onShowSource } = props;
  const place: Placement = { surface, fullWidth, theme };
  if (sourceOpen) return <SourceEditor kind={kind} content={content} label="Artifact source" place={place} onChange={onChange} />;
  if (kind === "code") return <SourceEditor kind={kind} content={content} label="Artifact content" place={place} onChange={onChange} />;
  if (isDocumentKind(kind)) {
    return (
      <ContentFrame place={place}>
        <DocumentEditor key={revision} kind={kind} value={content} onChange={onChange} label="Artifact content" sourceToggle={false} onEditSource={onShowSource} />
      </ContentFrame>
    );
  }
  if (kind === "csv") {
    return (
      <ContentFrame place={place}>
        <CsvContentEditor key={revision} value={content} onChange={onChange} title={title} files={files} label="Artifact content" />
      </ContentFrame>
    );
  }
  return <RenderedWithSource kind={kind} content={content} language={props.language} title={title} files={files} place={place} onShowSource={onShowSource} />;
}
