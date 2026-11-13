"use client";

import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TableBubbleMenu, TextBubbleMenu } from "@/components/editor/rich/bubble-menus";
import { richEditorExtensions } from "@/components/editor/rich/editor-extensions";
import { MarkdownLinkInput } from "@/components/editor/rich/markdown-link-input";
import type { SourceMap } from "@/components/editor/rich/markdown-roundtrip";
import { useCoarsePointer } from "@/components/editor/rich/use-coarse-pointer";
import { commentShowsLink } from "@/lib/markdown/link-href";
import { cn } from "@/lib/utils";

import { positionForOffset, withoutTypedTail, withTypedTail } from "./caret-handoff";
import { parseCommentMarkdown, serializeCommentMarkdown } from "./comment-markdown";
import { commentBoxClass, commentBoxHeight, commentBoxMaxHeight, commentFocusClass, commentTextClass, isSubmitShortcut } from "./comment-box";
import { CommentMentions, type MentionSource } from "./comment-mentions";

/** What the composer does with the rich box once it is ready. */
export interface CommentEditorApi {
  /**
   * Takes over from the plain box: its Markdown, and when the plain box had
   * focus, the caret's offset in its text.
   */
  load: (markdown: string, caret: number | null) => void;
}

export interface CommentEditorProps {
  onChange: (markdown: string) => void;
  label: string;
  placeholder: string;
  /** Hidden until it has taken over from the plain box. */
  hidden: boolean;
  /** Called once the editor exists, so the composer can hand it the plain box's text. */
  onReady: (api: CommentEditorApi) => void;
  /** Changes when the composer posted: the box empties and starts a fresh Markdown map. */
  clearSignal: number;
  /** ⌘↵ or Ctrl+↵, from anywhere in the box: text, a code block, or Markdown kept as written. */
  onSubmitShortcut: () => void;
  mentions: MentionSource;
  /** A short box, for the card at an inline comment's words. */
  compact: boolean;
}

const FILES_REFUSED = "Comments hold text only. To share a file, add it to the artifact.";

/** True when there is something to link: a selection, or a link under the cursor. */
function canEditLink(editor: Editor): boolean {
  return !editor.state.selection.empty || editor.isActive("link");
}

/** Empties the box after a post, with a fresh Markdown map so the next comment starts clean. */
function useClearOnSignal(editor: Editor | null, signal: number, sourceRef: React.RefObject<SourceMap>) {
  const seen = useRef(signal);
  useEffect(() => {
    if (!editor || seen.current === signal) return;
    seen.current = signal;
    sourceRef.current = parseCommentMarkdown("").source;
    editor.commands.clearContent(false);
  }, [editor, signal, sourceRef]);
}

/**
 * Puts the caret at `position` and focuses the box, now: the editor's own
 * focus command waits a frame, and a phone's browser can move the caret to
 * the start meanwhile.
 */
function focusAt(editor: Editor, position: number) {
  const { state, view } = editor;
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(position))));
  view.focus();
}

/**
 * Hands the composer the box's `load` once the editor exists. `load` takes
 * over in one step: the text goes in, the box shows, and the caret goes
 * where it was in the plain box, so no key typed meanwhile goes astray.
 */
function useHandoff(editor: Editor | null, root: React.RefObject<HTMLDivElement | null>, onReady: (api: CommentEditorApi) => void, sourceRef: React.RefObject<SourceMap>) {
  useEffect(() => {
    if (!editor) return;
    const api: CommentEditorApi = {
      load: (markdown, caret) => {
        // The spaces and line breaks typed last go in as text, which Markdown would drop, so the next word does not join the last.
        const loaded = parseCommentMarkdown(withoutTypedTail(markdown));
        sourceRef.current = loaded.source;
        editor.commands.setContent(withTypedTail(loaded.doc, markdown), { emitUpdate: false });
        // Shown at once, ahead of the composer's next render, which keeps it shown.
        if (root.current) root.current.hidden = false;
        if (caret !== null) focusAt(editor, positionForOffset(editor.state.doc, caret));
      },
    };
    let current = true;
    // After React's commit, where the editor's node views may render, and before any key typed next is handled.
    queueMicrotask(() => {
      if (current && !editor.isDestroyed) onReady(api);
    });
    return () => { current = false; };
  }, [editor, onReady, root, sourceRef]);
}

/**
 * The rich comment box: the artifact editor's schema, Markdown shortcuts,
 * Markdown paste, typed Markdown links, and the menu over selected text, in
 * a box that grows with its text. It reads and writes a comment's Markdown
 * (markdown-roundtrip.ts, "comment"): text stays as typed, and every part
 * nobody touched is written back exactly. Text only: no slash menu, no
 * media, no block handles. Loaded on demand; the composer shows a plain box
 * until it is ready (comment-composer.tsx).
 */
export default function CommentEditor({ onChange, label, placeholder, hidden, onReady, clearSignal, onSubmitShortcut, mentions, compact }: CommentEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [filesRefused, setFilesRefused] = useState(false);
  const sourceRef = useRef<SourceMap>(parseCommentMarkdown("").source);
  const root = useRef<HTMLDivElement>(null);
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
        pastedLinks: commentShowsLink,
      }),
      MarkdownLinkInput,
      CommentMentions,
    ],
    [placeholder],
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn("artifact-prose rich-editor-content max-w-none overflow-y-auto px-2.5 py-2 outline-none", commentTextClass, commentBoxHeight(compact), commentBoxMaxHeight(compact)),
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-autocomplete": "list",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: current }) => {
      setFilesRefused(false);
      onChangeRef.current(serializeCommentMarkdown(current.getJSON(), sourceRef.current));
    },
    onSelectionUpdate: () => { setLinkOpen(false); },
  });

  // People to mention load after the box: their chips are drawn once they arrive.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setMentionSource(mentions);
  }, [editor, mentions]);
  useHandoff(editor, root, onReady, sourceRef);
  useClearOnSignal(editor, clearSignal, sourceRef);

  function onKeyDownCapture(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isSubmitShortcut(event)) return;
    // Before the editor and its blocks see it: a code block would leave the block, and Markdown kept as written would add a line.
    event.preventDefault();
    event.stopPropagation();
    onSubmitShortcut();
  }

  return (
    <div ref={root} hidden={hidden}>
      <div data-slot="comment-editor" onKeyDownCapture={onKeyDownCapture} className={cn(commentBoxClass, commentFocusClass)}>
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
    </div>
  );
}
