"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Announce = (words: string) => void;

const EditorAnnounceContext = createContext<Announce | null>(null);

/** How long a spoken line stays in the region: long enough to be read out, short enough not to be found later as stray text. */
const spokenLineMs = 8000;

/** Outside an editor's region, words are not spoken; the control's tooltip still says them. */
const unspoken: Announce = () => undefined;

/**
 * The one polite live region of a rich editor, drawn beside the editor's
 * text and never inside it. Blocks in the text (a code block's Copy) speak
 * through it with `useEditorAnnounce`.
 *
 * A live region must never sit inside the text (the ProseMirror DOM). A
 * modal dialog (Base UI, through `markOthers` in its focus manager) keeps
 * every `[aria-live]` element on the page audible: it walks from `body`
 * down to each one and sets `aria-hidden` on every sibling along the way.
 * With a region inside the text, that walk writes `aria-hidden` onto the
 * editor's own blocks. ProseMirror reads attribute changes on its nodes as
 * an edit, finds the document unchanged, and draws the blocks again, which
 * destroys and makes again every block view in that range: a diagram's
 * open dialog, an open caption field, and the image viewer went with them
 * (issue #226).
 */
export function EditorLiveRegion({ children }: { children: ReactNode }) {
  const [spoken, setSpoken] = useState<{ id: number; text: string } | null>(null);
  const announce = useCallback<Announce>((words) => {
    setSpoken((current) => ({ id: (current?.id ?? 0) + 1, text: words }));
  }, []);
  useEffect(() => {
    if (!spoken) return undefined;
    const timer = window.setTimeout(() => { setSpoken((current) => (current?.id === spoken.id ? null : current)); }, spokenLineMs);
    return () => { window.clearTimeout(timer); };
  }, [spoken]);
  return (
    <EditorAnnounceContext.Provider value={announce}>
      {children}
      <div aria-live="polite" aria-atomic="true" data-editor-live-region="" data-comment-skip="" className="sr-only">
        {/* A new key for each line, so the same words said twice are spoken twice. */}
        {spoken ? <span key={spoken.id}>{spoken.text}</span> : null}
      </div>
    </EditorAnnounceContext.Provider>
  );
}

/** Speaks words through the editor's live region (EditorLiveRegion); outside one, it says nothing. */
export function useEditorAnnounce(): Announce {
  return useContext(EditorAnnounceContext) ?? unspoken;
}
