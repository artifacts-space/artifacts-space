"use client";

import { Extension, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TableBubbleMenu, TextBubbleMenu } from "@/components/editor/rich/bubble-menus";
import { richEditorExtensions } from "@/components/editor/rich/editor-extensions";
import { parseMarkdown, serializeMarkdown, type SourceMap } from "@/components/editor/rich/markdown-roundtrip";
import { useCoarsePointer } from "@/components/editor/rich/use-coarse-pointer";
import { cn } from "@/lib/utils";

import { commentBoxClass, commentBoxHeight, commentTextClass } from "./comment-box";
import { CommentMentions, type MentionSource } from "./comment-mentions";

export interface CommentEditorProps {
  /** The Markdown the box starts with: empty, a quote, or the comment being edited. */
  initialValue: string;
  onChange: (markdown: string) => void;
  label: string;
  placeholder: string;
  autoFocus: boolean;
  /** Changes when the composer posted: the box empties and starts a fresh Markdown map. */
  clearSignal: number;
  /** ⌘↵ or Ctrl+↵. */
  onSubmitShortcut: () => void;
  mentions: MentionSource;
  /** A short box, for the card at an inline comment's words. */
  compact: boolean;
}

/** The DOM event the box sends for ⌘↵ or Ctrl+↵. */
const SUBMIT_EVENT = "comment-submit";

const FILES_REFUSED = "Comments hold text only. To share a file, add it to the artifact.";

/** ⌘↵ or Ctrl+↵ posts the comment from anywhere in the box. */
const SubmitShortcut = Extension.create({
  name: "commentSubmit",
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => {
        this.editor.view.dom.dispatchEvent(new CustomEvent(SUBMIT_EVENT));
        return true;
      },
    };
  },
});

/** True when there is something to link: a selection, or a link under the cursor. */
function canEditLink(editor: Editor): boolean {
  return !editor.state.selection.empty || editor.isActive("link");
}

/** A comment started with text (a quote) opens with the cursor after it, in view. */
function revealStart(editor: Editor) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  editor.view.dom.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

/** Runs the composer's submit when the box asks for it. */
function useSubmitShortcut(editor: Editor | null, onSubmit: () => void) {
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    dom.addEventListener(SUBMIT_EVENT, onSubmit);
    return () => { dom.removeEventListener(SUBMIT_EVENT, onSubmit); };
  }, [editor, onSubmit]);
}

/** Empties the box after a post, with a fresh Markdown map so the next comment starts clean. */
function useClearOnSignal(editor: Editor | null, signal: number, sourceRef: React.RefObject<SourceMap>) {
  const seen = useRef(signal);
  useEffect(() => {
    if (!editor || seen.current === signal) return;
    seen.current = signal;
    sourceRef.current = parseMarkdown("").source;
    editor.commands.clearContent(false);
  }, [editor, signal, sourceRef]);
}

/**
 * The rich comment box: the artifact editor's schema, Markdown shortcuts,
 * Markdown paste, and menu over selected text, in a box that grows with
 * its text. It reads and writes Markdown with the same round trip as the
 * artifact editor, so an edited comment keeps every part nobody touched
 * exactly as written. Text only: no slash menu, no media, no block handles.
 * Loaded on demand (comment-composer.tsx).
 */
export default function CommentEditor({ initialValue, onChange, label, placeholder, autoFocus, clearSignal, onSubmitShortcut, mentions, compact }: CommentEditorProps) {
  const [loaded] = useState(() => parseMarkdown(initialValue));
  const [linkOpen, setLinkOpen] = useState(false);
  const [filesRefused, setFilesRefused] = useState(false);
  const sourceRef = useRef<SourceMap>(loaded.source);
  const onChangeRef = useRef(onChange);
  const coarse = useCoarsePointer();

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const extensions = useMemo(
    () => [
      ...richEditorExtensions({
        onLinkShortcut: (current) => {
          if (!canEditLink(current)) return false;
          setLinkOpen(true);
          return true;
        },
        media: false,
        onMediaRefused: () => { setFilesRefused(true); },
        boxPlaceholder: placeholder,
      }),
      CommentMentions,
      SubmitShortcut,
    ],
    [placeholder],
  );

  const editor = useEditor({
    extensions,
    content: loaded.doc,
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: cn("artifact-prose rich-editor-content max-w-none overflow-y-auto px-2.5 py-2 outline-none", commentTextClass, commentBoxHeight(compact), compact ? "max-h-40" : "max-h-96"),
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-autocomplete": "list",
        "aria-expanded": "false",
        spellcheck: "true",
      },
    },
    onCreate: ({ editor: current }) => {
      if (autoFocus && initialValue) revealStart(current);
    },
    onUpdate: ({ editor: current }) => {
      setFilesRefused(false);
      onChangeRef.current(serializeMarkdown(current.getJSON(), sourceRef.current));
    },
    onSelectionUpdate: () => { setLinkOpen(false); },
  });

  // People to mention load after the box: their chips are drawn once they arrive.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setMentionSource(mentions);
  }, [editor, mentions]);
  useSubmitShortcut(editor, onSubmitShortcut);
  useClearOnSignal(editor, clearSignal, sourceRef);

  return (
    <>
      <div data-slot="comment-editor" className={cn(commentBoxClass, "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50")}>
        {editor && !coarse ? (
          <>
            <TextBubbleMenu editor={editor} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} commentButton={false} />
            <TableBubbleMenu editor={editor} />
          </>
        ) : null}
        <EditorContent editor={editor} />
      </div>
      {/* Kept in the page, so screen readers hear the note when it appears. */}
      <p role="status" className={cn("mt-2 text-xs text-muted-foreground", !filesRefused && "sr-only")}>{filesRefused ? FILES_REFUSED : ""}</p>
    </>
  );
}
