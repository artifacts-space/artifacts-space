"use client";

import { IconMarkdown } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { HighlightedTextarea } from "./highlighted-textarea";
import { BlockHandlesFrame, useBlockHandles } from "./rich/block-menu/block-controls";
import { TableBubbleMenu, TextBubbleMenu } from "./rich/bubble-menus";
import { richEditorExtensions } from "./rich/editor-extensions";
import { parseMarkdown, serializeMarkdown, type SourceMap } from "./rich/markdown-roundtrip";
import { TouchToolbar } from "./rich/touch-toolbar";
import { useCoarsePointer } from "./rich/use-coarse-pointer";

type Mode = "rich" | "markdown";

interface RichMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoFocus?: boolean;
  /** Show the Markdown source switch above the document (default). The /app editor keeps the source behind View source. */
  sourceToggle?: boolean;
  /** Opens the source elsewhere when a part can only be edited as Markdown; without it, the switch above opens. */
  onEditSource?: () => void;
  /** False where saves don't attach files (a ui artifact's Markdown block): no media blocks, and file paste or drop is refused with a note. */
  media?: boolean | undefined;
  /** Block handles and the block menu, for a document on an artifact page (BlockMenuFor). Off by default, as in a ui artifact's Markdown block. */
  blockHandles?: boolean | undefined;
}

/** What a block without media says when a file is pasted or dropped into it. */
export const mediaRefusedMessage = "Files can’t go in a Markdown block. To show an image or a file, add an Image or File block.";

/** Says why a pasted or dropped file did not go in, in a block without media; empty otherwise, so screen readers hear it when it appears. */
function MediaRefusedNote({ shown }: { shown: boolean }) {
  return <p role="status" className={cn("text-sm text-muted-foreground", shown ? "mb-3" : "sr-only")}>{shown ? mediaRefusedMessage : ""}</p>;
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

/** The switch between the document and its Markdown source, above the editor. */
function SourceSwitch({ markdown, onClick }: { markdown: boolean; onClick: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-end">
      <Button type="button" variant="ghost" size="sm" aria-pressed={markdown} onClick={onClick} className={cn("text-muted-foreground", markdown && "bg-muted text-foreground")}>
        <IconMarkdown aria-hidden /> Markdown
      </Button>
    </div>
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
export default function RichMarkdownEditor({ value, onChange, label, autoFocus = false, sourceToggle = true, onEditSource, media, blockHandles }: RichMarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>("rich");
  const [loaded] = useState(() => parseMarkdown(value));
  const [rawBlocks, setRawBlocks] = useState(loaded.rawBlocks);
  const [linkOpen, setLinkOpen] = useState(false);
  const [mediaRefused, setMediaRefused] = useState(false);
  const sourceRef = useRef<SourceMap>(loaded.source);
  const onChangeRef = useRef(onChange);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const coarse = useCoarsePointer();
  const blocks = useBlockHandles(blockHandles === true);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const extensions = useMemo(
    () => [
      ...richEditorExtensions({
        onLinkShortcut: (current) => {
          if (!canEditLink(current)) return false;
          setLinkOpen(true);
          return true;
        },
        media,
        onMediaRefused: () => { setMediaRefused(true); },
      }),
      ...blocks.extensions,
    ],
    [media, blocks.extensions],
  );

  const editor = useEditor({
    extensions,
    content: loaded.doc,
    immediatelyRender: false,
    autofocus: autoFocus ? "start" : false,
    editorProps: {
      attributes: { class: "artifact-prose rich-editor-content", "data-comment-root": "", "aria-label": label, role: "textbox", "aria-multiline": "true", spellcheck: "true" },
    },
    onUpdate: ({ editor: current }) => {
      setMediaRefused(false);
      onChangeRef.current(serializeMarkdown(current.getJSON(), sourceRef.current));
    },
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
      {sourceToggle ? <SourceSwitch markdown={mode === "markdown"} onClick={mode === "rich" ? showMarkdown : showRich} /> : null}
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
            <RawBlocksNotice count={rawBlocks} onShowMarkdown={onEditSource ?? showMarkdown} />
            <MediaRefusedNote shown={mediaRefused} />
            {coarse ? <TouchToolbar editor={editor} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} /> : <TextBubbleMenu editor={editor} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} />}
            <TableBubbleMenu editor={editor} />
          </>
        ) : null}
        <BlockHandlesFrame editor={editor} on={blocks.on}>
          <EditorContent editor={editor} className="min-h-[50dvh]" />
        </BlockHandlesFrame>
      </div>
    </div>
  );
}
