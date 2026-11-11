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
 * True while the cursor or a text selection touches the source of the block
 * at `getPos()`, including a selection that starts inside and runs past it,
 * so the source never hides under the text being selected. Selecting the
 * block itself does not count.
 */
function useCursorInside(editor: Editor, getPos: () => number | undefined): boolean {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const pos = getPos();
      const { selection, doc } = current.state;
      if (typeof pos !== "number" || selection instanceof NodeSelection) return false;
      const node = doc.nodeAt(pos);
      if (!node) return false;
      return selection.from <= pos + node.nodeSize - 1 && selection.to >= pos + 1;
    },
  });
}

/** What the block shows: the source, the diagram, or both. */
type Layout = "code" | "diagram" | "both";

/**
 * The layout for a view. Preview shows the source too while an editor's
 * cursor is in it, or while the diagram is empty or broken, so it can be
 * fixed; a person who is only reading sees the diagram alone.
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
 */
export function MermaidBlockView({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const attrs = useCodeBlockAttrs(node.attrs.language, updateAttributes);
  const view = attrs.fence.view ?? defaultDiagramView;
  const code = node.textContent;
  const preview = useSettledValue(code, previewDelayMs);
  const inside = useCursorInside(editor, getPos);
  const { scopeRef, state } = useMermaidDiagram(preview, { keepPrevious: true, deferUntilNear: true, skip: view === "code" });
  const editable = editor.isEditable;
  const sourceNeeded = editable && (inside || code.trim() === "" || state.status === "failed");
  const layout = blockLayout(view, sourceNeeded);
  const sides = sideClasses[layout];

  return (
    <NodeViewWrapper
      className="rich-code-block group/code"
      data-mermaid-block=""
      data-diagram-view={view}
      data-diagram-state={state.status}
      data-source-open={layout === "diagram" ? undefined : ""}
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
          onView={attrs.setView}
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
