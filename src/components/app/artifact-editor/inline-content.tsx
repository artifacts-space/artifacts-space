"use client";

import { useEffect, useRef, type RefObject } from "react";

import { IconCode, IconCodeOff } from "@tabler/icons-react";

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
 * their rendered view, and View source edits them. The source of every
 * format has a Hide source button above it, where Edit source sits above a
 * rendered view, so the way back never hides in a menu.
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

/**
 * The source field's frame: a card on the artifact page; in /app, the theme
 * across the pane around the page column (the whole pane when full width).
 * `above` (the Hide source button) sits over the card on the page, where
 * Edit source sits over a rendered view, and at the top of the column in /app.
 */
function SourceFrame({ place, above, children }: { place: Placement; above?: React.ReactNode; children: React.ReactNode }) {
  const { surface, fullWidth, theme } = place;
  if (surface === "page") {
    return (
      <div className="min-w-0">
        {above}
        <div className="card-surface flex flex-col overflow-hidden" data-full-width={fullWidth}>{children}</div>
      </div>
    );
  }
  return (
    <ThemeScope theme={theme} className={cn("flex flex-[1_0_auto] flex-col text-foreground", gutterRoom, isThemed(theme) && "bg-background")} data-content-theme="">
      <div className={cn("flex flex-1 flex-col", editColumnClass(fullWidth))} data-full-width={fullWidth}>
        {above}
        {children}
      </div>
    </ThemeScope>
  );
}

/** Set by a press of Edit source or Hide source, so the button that takes its place takes the focus too. */
type FocusHandoff = RefObject<boolean>;

interface SourceSwitchProps {
  /** The source is showing, so the button hides it. */
  open: boolean;
  handoff: FocusHandoff;
  onPress: () => void;
  className?: string;
}

/**
 * Edit source over a rendered view, Hide source over its source: one switch
 * in one place. The pressed button leaves the page with its view, so the one
 * that arrives takes the focus, and a keyboard press can go straight back.
 */
function SourceSwitch({ open, handoff: handoffRef, onPress, className }: SourceSwitchProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!handoffRef.current) return;
    handoffRef.current = false;
    button.current?.focus({ preventScroll: true });
  }, [handoffRef]);
  return (
    <div className={cn("flex justify-end", className)} data-comment-skip="">
      <Button ref={button} variant="ghost" size="sm" onClick={() => { handoffRef.current = true; onPress(); }} className="text-muted-foreground">
        {open ? <IconCodeOff aria-hidden /> : <IconCode aria-hidden />} {open ? "Hide source" : "Edit source"}
      </Button>
    </div>
  );
}

const sourceField = "min-h-[460px] flex-1 resize-y rounded-none border-0 font-mono text-base leading-7 md:text-sm shadow-none outline-none focus-visible:ring-0";

/**
 * The source field's padding. In the pane its sides are the page column's
 * own padding (px-6 in pageColumnClass), so the source starts and ends where
 * the title above it does; on the artifact page the field is a card with
 * its own room.
 */
function sourcePadding(surface: InlineSurface, underSwitch: boolean): string {
  if (surface === "page") return "p-6 sm:p-8";
  // Under Hide source the button's row gives the room above.
  return underSwitch ? "px-6 pt-3 pb-6 sm:pb-8" : "px-6 py-6 sm:py-8";
}

/** Where Hide source sits: over the card on the page, and at the top of the column in /app, with the room a rendered view has above it. */
function switchPlace(surface: InlineSurface): string {
  return surface === "pane" ? "px-6 pt-5 sm:pt-8" : "mb-3";
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
  /** Closes View source. With it the source has a Hide source button above it. */
  onHideSource?: (() => void) | undefined;
}

/** The handoff for one content area. A press that no button answered (the source opened from a document's own control) is forgotten, so it never moves the focus later. */
function useFocusHandoff(sourceOpen: boolean): FocusHandoff {
  const handoffRef = useRef(false);
  useEffect(() => { handoffRef.current = false; }, [sourceOpen]);
  return handoffRef;
}

/** The way back from the source, where there is one: code is its own source, with no other view to go back to. */
function hideFor(kind: ArtifactKind, handoff: FocusHandoff, onHideSource: (() => void) | undefined): SourceEditorProps["hide"] {
  return onHideSource && kind !== "code" ? { handoff, onHide: onHideSource } : undefined;
}

interface SourceEditorProps {
  kind: ArtifactKind;
  content: string;
  label: string;
  place: Placement;
  onChange: (content: string) => void;
  /** The way back to the rendered view; code is its own source and has none. */
  hide?: { handoff: FocusHandoff; onHide: () => void } | undefined;
}

/** The raw content, for View source and for code. Spell check only for prose. */
function SourceEditor({ kind, content, label, place, onChange, hide }: SourceEditorProps) {
  const above = hide ? <SourceSwitch open handoff={hide.handoff} onPress={hide.onHide} className={switchPlace(place.surface)} /> : undefined;
  return (
    <SourceFrame place={place} above={above}>
      <Textarea
        value={content}
        onChange={(event) => { onChange(event.target.value); }}
        aria-label={label}
        spellCheck={isDocumentKind(kind)}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn(sourceField, sourcePadding(place.surface, hide !== undefined), place.surface === "pane" ? surfaceClass(place.theme) : "bg-card")}
      />
      <ContentStatus kind={kind} content={content} className={statusPadding(place.surface)} />
    </SourceFrame>
  );
}

/** The rendered view for formats edited through View source, with a quiet way into it. */
function RenderedWithSource({ kind, content, language, title, files, place, handoff, onShowSource }: Pick<InlineContentProps, "kind" | "content" | "language" | "title" | "files" | "onShowSource"> & { place: Placement; handoff: FocusHandoff }) {
  return (
    <ContentFrame place={place}>
      <SourceSwitch open={false} handoff={handoff} onPress={onShowSource} className="mb-3" />
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
  const { kind, content, title, files, revision, sourceOpen, surface = "pane", fullWidth = false, theme = null, onChange, onShowSource, onHideSource } = props;
  const place: Placement = { surface, fullWidth, theme };
  const handoff = useFocusHandoff(sourceOpen);
  const hide = hideFor(kind, handoff, onHideSource);
  if (sourceOpen) return <SourceEditor kind={kind} content={content} label="Artifact source" place={place} onChange={onChange} hide={hide} />;
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
  return <RenderedWithSource kind={kind} content={content} language={props.language} title={title} files={files} place={place} handoff={handoff} onShowSource={onShowSource} />;
}
