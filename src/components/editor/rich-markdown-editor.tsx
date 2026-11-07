"use client";

import { IconMarkdown } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { HighlightedTextarea } from "./highlighted-textarea";
import { TableBubbleMenu, TextBubbleMenu } from "./rich/bubble-menus";
import { richEditorExtensions } from "./rich/editor-extensions";
import { parseMarkdown, serializeMarkdown, type SourceMap } from "./rich/markdown-roundtrip";
import { TouchToolbar } from "./rich/touch-toolbar";

type Mode = "rich" | "markdown";

const coarseQuery = "(pointer: coarse)";

function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia(coarseQuery);
  query.addEventListener("change", onChange);
  return () => { query.removeEventListener("change", onChange); };
}

/** True on touch screens, where the toolbar replaces the menu over the selection. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia(coarseQuery).matches, () => false);
}

interface RichMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoFocus?: boolean;
}

function RawBlocksNotice({ count, onShowMarkdown }: { count: number; onShowMarkdown: () => void }) {
  if (count === 0) return null;
  return (
    <p role="note" className="mb-4 flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
      <span>
        {count === 1 ? "One part uses Markdown this editor can’t format, such as HTML or footnotes. It stays exactly as written." : `${String(count)} parts use Markdown this editor can’t format, such as HTML or footnotes. They stay exactly as written.`}
      </span>
      <button type="button" onClick={onShowMarkdown} className="rounded-sm text-foreground underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        Edit as Markdown
      </button>
    </p>
  );
}

/** True when there is something to link: a selection, or a link under the cursor. */
function canEditLink(editor: Editor): boolean {
  return !editor.state.selection.empty || editor.isActive("link");
}

/**
 * The Markdown editor people use on an artifact's page: a document that
 * looks like the rendered artifact, with Markdown shortcuts as you type, a
 * slash menu for blocks, a menu over selected text, and a Markdown toggle for
 * the raw source. It reads and writes Markdown; blocks nobody touched are
 * saved exactly as they were loaded.
 */
export default function RichMarkdownEditor({ value, onChange, label, autoFocus = false }: RichMarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>("rich");
  const [loaded] = useState(() => parseMarkdown(value));
  const [rawBlocks, setRawBlocks] = useState(loaded.rawBlocks);
  const [linkOpen, setLinkOpen] = useState(false);
  const sourceRef = useRef<SourceMap>(loaded.source);
  const onChangeRef = useRef(onChange);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const coarse = useCoarsePointer();

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const extensions = useMemo(
    () =>
      richEditorExtensions({
        onLinkShortcut: (current) => {
          if (!canEditLink(current)) return false;
          setLinkOpen(true);
          return true;
        },
      }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: loaded.doc,
    immediatelyRender: false,
    autofocus: autoFocus ? "start" : false,
    editorProps: {
      attributes: { class: "artifact-prose rich-editor-content", "aria-label": label, role: "textbox", "aria-multiline": "true", spellcheck: "true" },
    },
    onUpdate: ({ editor: current }) => { onChangeRef.current(serializeMarkdown(current.getJSON(), sourceRef.current)); },
    onSelectionUpdate: () => { setLinkOpen(false); },
  });

  function showMarkdown() {
    setLinkOpen(false);
    setMode("markdown");
  }

  function showRich() {
    const next = parseMarkdown(value);
    sourceRef.current = next.source;
    setRawBlocks(next.rawBlocks);
    editor?.commands.setContent(next.doc, { emitUpdate: false });
    setMode("rich");
    requestAnimationFrame(() => { editor?.commands.focus(); });
  }

  return (
    <div className="rich-editor">
      <div className="mb-3 flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={mode === "markdown"}
          onClick={mode === "rich" ? showMarkdown : showRich}
          className={cn("text-muted-foreground", mode === "markdown" && "bg-muted text-foreground")}
        >
          <IconMarkdown aria-hidden /> Markdown
        </Button>
      </div>
      {mode === "markdown" ? (
        <HighlightedTextarea
          textareaRef={textareaRef}
          value={value}
          onChange={(event) => { onChange(event.target.value); }}
          aria-label={`${label} (Markdown)`}
          autoFocus
          spellCheck
          className="max-h-none min-h-[50dvh]"
        />
      ) : null}
      <div hidden={mode !== "rich"}>
        {editor ? (
          <>
            <RawBlocksNotice count={rawBlocks} onShowMarkdown={showMarkdown} />
            {coarse ? <TouchToolbar editor={editor} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} /> : <TextBubbleMenu editor={editor} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} />}
            <TableBubbleMenu editor={editor} />
          </>
        ) : null}
        <EditorContent editor={editor} className="min-h-[50dvh]" />
      </div>
    </div>
  );
}
