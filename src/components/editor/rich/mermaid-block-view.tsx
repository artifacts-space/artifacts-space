"use client";

import { IconPencil } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

import { DiagramFailedNote, MarkdownDiagramBody } from "@/components/artifact-view/markdown-mermaid";
import { DiagramFigure } from "@/components/artifact-view/mermaid-view";
import { useMermaidDiagram, type DiagramState } from "@/components/artifact-view/use-mermaid-diagram";
import { Button } from "@/components/ui/button";

import { blockLanguage, CodeLanguagePicker } from "./code-language-picker";

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
 * block itself (after Done) does not count.
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

interface PreviewProps {
  code: string;
  state: DiagramState;
  editable: boolean;
  sourceOpen: boolean;
  onEdit: () => void;
}

/** The diagram above the source: a hint when empty, the short note when it fails, else the drawing. */
function DiagramPreview({ code, state, editable, sourceOpen, onEdit }: PreviewProps) {
  if (code.trim() === "") return <p role="note" className="text-sm leading-6 text-muted-foreground">Write Mermaid source below, such as <code>flowchart TD</code>, to draw a diagram.</p>;
  if (!editable) return <MarkdownDiagramBody code={code} state={state} />;
  if (state.status === "failed") return <DiagramFailedNote reason={state.reason} />;
  if (sourceOpen) return <DiagramFigure diagram={state.diagram} />;
  return (
    // A click anywhere on the diagram opens its source; the Edit button does the same for keyboards and screen readers.
    <div className="relative cursor-pointer" onClick={onEdit}>
      <DiagramFigure diagram={state.diagram} />
      <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); onEdit(); }} className="absolute top-1.5 right-1.5 text-muted-foreground">
        <IconPencil aria-hidden /> Edit diagram
      </Button>
    </div>
  );
}

/** The line between the live preview and the source: what it is, and Done to close it. */
function SourceBar({ onDone }: { onDone: () => void }) {
  return (
    <div contentEditable={false} className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground select-none">
      <span>Mermaid source. The diagram updates as you type.</span>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>Done</Button>
    </div>
  );
}

/**
 * A ```mermaid code block in the editor: the diagram, drawn by the same
 * renderer as the read view. Clicking it (or Edit diagram) puts the cursor in
 * its source, which opens below a live preview that redraws once typing
 * pauses; moving the cursor out, or Done, closes it. Empty and broken
 * diagrams keep the source open. The Markdown stays the fenced block.
 */
export function MermaidBlockView({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const code = node.textContent;
  const preview = useSettledValue(code, previewDelayMs);
  const inside = useCursorInside(editor, getPos);
  const { scopeRef, state } = useMermaidDiagram(preview, { keepPrevious: true, deferUntilNear: true });
  const [opening, setOpening] = useState(false);
  const editable = editor.isEditable;
  const sourceOpen = editable && (opening || inside || code.trim() === "" || state.status === "failed");

  function openSource() {
    const pos = getPos();
    if (typeof pos !== "number") return;
    // Show the source first: the browser cannot put the cursor in hidden text.
    flushSync(() => { setOpening(true); });
    editor.chain().focus().setTextSelection(pos + 1 + node.content.size).run();
    setOpening(false);
  }
  function closeSource() {
    const pos = getPos();
    if (typeof pos === "number") editor.chain().focus().setNodeSelection(pos).run();
  }

  return (
    <NodeViewWrapper className="rich-code-block" data-mermaid-block="" data-diagram-state={state.status} data-source-open={sourceOpen ? "" : undefined}>
      <div ref={scopeRef} contentEditable={false} className="min-w-0 select-none">
        <DiagramPreview code={preview} state={state} editable={editable} sourceOpen={sourceOpen} onEdit={openSource} />
      </div>
      <div className={sourceOpen ? "mt-3" : "hidden"}>
        {editable ? <SourceBar onDone={closeSource} /> : null}
        <div className="relative">
          <CodeLanguagePicker language={blockLanguage(node.attrs.language)} disabled={!editable} onChange={(next) => { updateAttributes({ language: next }); }} />
          <pre spellCheck={false}>
            <NodeViewContent<"code"> as="code" />
          </pre>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
