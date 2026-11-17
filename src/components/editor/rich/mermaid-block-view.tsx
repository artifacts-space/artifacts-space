"use client";

import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";

import { DiagramFailedNote, MarkdownDiagramBody } from "@/components/artifact-view/markdown-mermaid";
import { DiagramFigure } from "@/components/artifact-view/mermaid-view";
import { useMermaidDiagram, type DiagramState } from "@/components/artifact-view/use-mermaid-diagram";
import { defaultDiagramView, type DiagramView } from "@/lib/markdown/fence-info";
import { cn } from "@/lib/utils";

import { useCodeBlockAttrs } from "./code-block-attrs";
import { BlockCaptionField, CodeBlockToolbar } from "./code-block-toolbar";

/** How long the source must rest before the preview draws again, in ms. */
export const previewDelayMs = 400;

/** `value`, once it has stopped changing for `delay` ms. */
function useSettledValue(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (settled === value) return undefined;
    const timer = setTimeout(() => { setSettled(value); }, delay);
    return () => { clearTimeout(timer); };
  }, [value, delay, settled]);
  return settled;
}

/**
 * True when a selection from `anchor` to `head` rests in the source of the
 * block that starts at `pos` and is `size` long: the cursor is in it, or a
 * selection starts or ends in it. A selection that only covers the block,
 * with both ends outside (Select all), does not rest in it.
 */
export function restsInSource(anchor: number, head: number, pos: number, size: number): boolean {
  const within = (at: number) => at >= pos + 1 && at <= pos + size - 1;
  return within(anchor) || within(head);
}

/** Where a selection is, as a block sees it: resting in its source, covering the whole block from outside, or neither. */
export type SelectionPlace = "in" | "over" | "away";

/** Where a selection from `anchor` to `head` is for the block that starts at `pos` and is `size` long. */
export function selectionPlace(anchor: number, head: number, pos: number, size: number): SelectionPlace {
  if (restsInSource(anchor, head, pos, size)) return "in";
  return Math.min(anchor, head) <= pos && Math.max(anchor, head) >= pos + size ? "over" : "away";
}

/**
 * Where the selection is for the block at `getPos()`. "in" while the cursor,
 * or one end of a text selection, rests in its source, so text being typed
 * or selected there is never hidden. "over" while a selection covers the
 * block from outside (Select all), which opens nothing. Selecting the block
 * itself is "away": the editor marks that itself.
 */
function useSelectionPlace(editor: Editor, getPos: () => number | undefined): SelectionPlace {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const pos = getPos();
      const { selection, doc } = current.state;
      if (typeof pos !== "number" || selection instanceof NodeSelection) return "away";
      const node = doc.nodeAt(pos);
      if (!node) return "away";
      return selectionPlace(selection.anchor, selection.head, pos, node.nodeSize);
    },
  });
}

/**
 * Takes the selection out of the source of the block at `getPos()` by
 * selecting the block itself, when the selection rests in the source. The
 * source can then hide without the cursor in it.
 */
function leaveSource(editor: Editor, getPos: () => number | undefined) {
  const pos = getPos();
  const { selection, doc } = editor.state;
  if (typeof pos !== "number" || selection instanceof NodeSelection) return;
  const node = doc.nodeAt(pos);
  if (!node || !restsInSource(selection.anchor, selection.head, pos, node.nodeSize)) return;
  editor.commands.setNodeSelection(pos);
}

/** What the block shows: the source, the diagram, or both. */
type Layout = "code" | "diagram" | "both";

/**
 * The layout for a view. Preview is the diagram alone. It shows the source
 * too only while an editor needs it: the diagram is empty or broken, so
 * there is nothing to draw until it is fixed, or the cursor is in the source
 * (see MermaidBlockView for how it gets there).
 */
export function blockLayout(view: DiagramView, sourceNeeded: boolean): Layout {
  if (view === "code") return "code";
  if (view === "split" || sourceNeeded) return "both";
  return "diagram";
}

/** Classes for the two sides by layout: the hidden side stays in the tree, so the editable source never remounts. */
const sideClasses: Record<Layout, { grid: string; source: string; diagram: string }> = {
  code: { grid: "", source: "", diagram: "hidden" },
  diagram: { grid: "", source: "hidden", diagram: "" },
  both: { grid: "@xl:grid-cols-2", source: "", diagram: "border-t border-code-border @xl:border-t-0 @xl:border-l" },
};

/** The diagram side of the block: a hint when empty, the short note when it fails, else the drawing (larger with a click). */
function DiagramPane({ code, state, editable, sourceShown }: { code: string; state: DiagramState; editable: boolean; sourceShown: boolean }) {
  if (code.trim() === "") return <p role="note" className="px-4 py-3.5 text-sm leading-6 text-muted-foreground">Write Mermaid source, such as <code>flowchart TD</code>, to draw a diagram.</p>;
  if (!editable && !sourceShown) return <MarkdownDiagramBody code={code} state={state} />;
  if (state.status === "failed") return <div className="px-4 py-3.5"><DiagramFailedNote reason={state.reason} /></div>;
  // While the source is hidden, screen readers get it here, as in the read view.
  return <DiagramFigure diagram={state.diagram} source={sourceShown ? undefined : code} zoomable framed={false} />;
}

/**
 * A ```mermaid code block in the editor, in its view (markdown-dialect.md):
 * Code shows the editable source, Preview the diagram, and Split both, side
 * by side when the block is wide and stacked when it is narrow. The toolbar
 * has the language and view pickers on the left and Copy, Wrap code, and
 * Caption on the right; the view is saved in the fence. The diagram draws
 * with the read view's renderer, redraws once typing pauses, and opens
 * larger with a click. The source and its cursor stay in one place in the
 * document whatever the view, so switching never loses an edit.
 *
 * Preview and the cursor: picking Preview takes the cursor out of the
 * source (the block is selected instead), so the diagram shows alone at
 * once. The cursor cannot enter a hidden source: arrow keys and clicks pass
 * over it. It is in the source in Preview only where the source was already
 * showing: a new or broken diagram someone is typing, or an undo that puts
 * the cursor back. The source then stays until the cursor leaves, so typed
 * text is never hidden. A selection that covers the block (Select all)
 * opens nothing; the block is outlined, as a selected block is, because the
 * next key would replace it.
 */
export function MermaidBlockView({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const attrs = useCodeBlockAttrs(node.attrs.language, updateAttributes);
  const view = attrs.fence.view ?? defaultDiagramView;
  const code = node.textContent;
  const preview = useSettledValue(code, previewDelayMs);
  const place = useSelectionPlace(editor, getPos);
  const inside = place === "in";
  const { scopeRef, state } = useMermaidDiagram(preview, { keepPrevious: true, deferUntilNear: true, skip: view === "code" });
  const editable = editor.isEditable;
  const unfinished = code.trim() === "" || state.status === "failed";
  const sourceNeeded = editable && (inside || unfinished);
  const layout = blockLayout(view, sourceNeeded);
  const sides = sideClasses[layout];
  const setView = (next: DiagramView) => {
    attrs.setView(next);
    // An unfinished diagram keeps its source in Preview, so the cursor may stay in it.
    if (next === "preview" && !unfinished) leaveSource(editor, getPos);
  };

  return (
    <NodeViewWrapper
      className="rich-code-block group/code"
      data-mermaid-block=""
      data-diagram-view={view}
      data-diagram-state={state.status}
      data-source-open={layout === "diagram" ? undefined : ""}
      // The diagram cannot show a text selection, so a selection that covers it is drawn as the block's outline: typing would replace it.
      data-selection-over={layout === "diagram" && place === "over" ? "" : undefined}
    >
      <div className="rich-code-frame">
        <CodeBlockToolbar
          language={attrs.language}
          code={code}
          editable={editable}
          view={view}
          wrap={attrs.fence.wrap}
          captionShown={attrs.captionShown}
          onLanguage={attrs.setLanguage}
          onView={setView}
          onWrap={attrs.setWrap}
          onCaption={attrs.openCaption}
        />
        <div className="@container">
          <div className={cn("grid min-w-0", sides.grid)}>
            <pre spellCheck={false} data-wrap={attrs.fence.wrap ? "" : undefined} className={cn("min-w-0", sides.source)}>
              <NodeViewContent<"code"> as="code" />
            </pre>
            <div
              ref={scopeRef}
              contentEditable={false}
              className={cn("min-w-0 bg-card select-none", sides.diagram)}
            >
              <DiagramPane code={preview} state={state} editable={editable} sourceShown={layout === "both"} />
            </div>
          </div>
        </div>
      </div>
      <BlockCaptionField attrs={attrs} />
    </NodeViewWrapper>
  );
}
