"use client";

import { shift } from "@floating-ui/dom";
import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { exitSuggestion, type SuggestionKeyDownProps, type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useImperativeHandle, useState } from "react";

import { mentionClasses } from "@/components/editor/mention-classes";
import { matchMentionables, type Mentionable } from "@/lib/comments/mention-autocomplete";
import { splitMentions, type MentionKind } from "@/lib/comments/mentions";

import { mentionEditAt, mentionMatchAt } from "./mention-match";
import { MentionHint, mentionPopoverClass, MentionSuggestionList } from "./mention-suggestions";

/** Who the writer can mention, read fresh on every keystroke (the list loads after the box). */
export interface MentionSource {
  candidates: readonly Mentionable[];
  self: Mentionable | null;
  /** Handles that show as chips: the candidates and the writer. */
  resolved: ReadonlyMap<string, MentionKind>;
}

const suggestionKey = new PluginKey("commentMention");
const highlightKey = new PluginKey<DecorationSet>("commentMentionHighlight");

let listCount = 0;

/** What the menu exposes to the suggestion plugin. */
interface MentionMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface MentionMenuProps {
  listId: string;
  items: Mentionable[];
  query: string;
  self: Mentionable | null;
  hasCandidates: boolean;
  command: (item: Mentionable) => void;
  onActive: (index: number) => void;
  ref?: React.Ref<MentionMenuHandle>;
}

/** The step a list key takes, or null for any other key. Modified keys (⌘↵ posts) are left alone. */
function stepFor(event: KeyboardEvent): number | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key === "ArrowDown") return 1;
  if (event.key === "ArrowUp") return -1;
  return null;
}

function picks(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "Enter" || event.key === "Tab");
}

/**
 * The suggestions under a typed "@": arrow keys move, Enter or Tab picks,
 * Escape closes (the plugin does that). Focus stays in the box. When nothing
 * matches, a short hint says why, and Enter goes on to the text.
 */
function MentionMenu({ listId, items, query, self, hasCandidates, command, onActive, ref }: MentionMenuProps) {
  const [active, setActive] = useState(0);
  const [itemsSeen, setItemsSeen] = useState(items);
  if (itemsSeen !== items) {
    setItemsSeen(items);
    setActive(0);
  }

  useEffect(() => { onActive(items.length > 0 ? active : -1); }, [active, items.length, onActive]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "Escape") {
        // The box sits in a dialog or a card: Escape closes the list, not them.
        event.stopPropagation();
        return true;
      }
      if (items.length === 0) return false;
      const step = stepFor(event);
      if (step !== null) {
        setActive((current) => (current + step + items.length) % items.length);
        return true;
      }
      const item = items[active];
      if (!picks(event) || !item) return false;
      command(item);
      return true;
    },
  }), [active, command, items]);

  if (items.length === 0) return <MentionHint query={query} self={self} hasCandidates={hasCandidates} />;
  return <MentionSuggestionList id={listId} options={items} activeIndex={active} optionId={(index) => `${listId}-${String(index)}`} onPick={command} onHover={setActive} />;
}

/** The box's combobox state for screen readers: open, which list, and the highlighted option. */
function setComboboxState(editor: Editor, listId: string, activeIndex: number | null) {
  const dom = editor.view.dom;
  const open = activeIndex !== null && activeIndex >= 0;
  dom.setAttribute("aria-expanded", String(open));
  if (open) {
    dom.setAttribute("aria-controls", listId);
    dom.setAttribute("aria-activedescendant", `${listId}-${String(activeIndex)}`);
    return;
  }
  dom.removeAttribute("aria-controls");
  dom.removeAttribute("aria-activedescendant");
}

/** Puts "@handle" where the "@" is being typed, with the same spacing rules as before, and closes the list. */
function pickMention(editor: Editor, handle: string) {
  const match = mentionMatchAt(editor.state.selection.$from);
  if (!match) return;
  const edit = mentionEditAt(match, handle);
  const tr = editor.state.tr.insertText(edit.insert, edit.from, edit.to);
  tr.setSelection(TextSelection.create(tr.doc, Math.min(edit.caret, tr.doc.content.size)));
  editor.view.dispatch(tr);
  // A handle followed by punctuation would read as a new "@" query; it stays closed until the next space.
  exitSuggestion(editor.view, suggestionKey);
  editor.commands.focus();
}

type MentionProps = SuggestionProps<Mentionable, Mentionable>;

function renderMentionMenu(source: () => MentionSource, listId: string): ReturnType<NonNullable<SuggestionOptions<Mentionable, Mentionable>["render"]>> {
  let renderer: ReactRenderer<MentionMenuHandle, MentionMenuProps> | null = null;
  let unmount: (() => void) | null = null;
  const propsFor = (props: MentionProps): MentionMenuProps => {
    const { self, candidates } = source();
    return {
      listId,
      items: props.items,
      query: props.query,
      self,
      hasCandidates: candidates.length > 0,
      command: (item) => { props.command(item); },
      onActive: (index) => { setComboboxState(props.editor, listId, index); },
    };
  };
  return {
    onStart: (props) => {
      renderer = new ReactRenderer(MentionMenu, { props: propsFor(props), editor: props.editor, className: mentionPopoverClass });
      renderer.element.setAttribute("data-slot", "mention-menu");
      // Inside the box, so the dialog or card around it counts a press on the list as its own.
      (props.editor.view.dom.parentElement ?? document.body).appendChild(renderer.element);
      unmount = props.mount(renderer.element);
    },
    onUpdate: (props) => { renderer?.updateProps(propsFor(props)); },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => renderer?.ref?.onKeyDown(event) ?? false,
    onExit: (props) => {
      unmount?.();
      renderer?.element.remove();
      renderer?.destroy();
      renderer = null;
      unmount = null;
      setComboboxState(props.editor, listId, null);
    },
  };
}

/** Chips on every resolved @handle in the text, outside code: the same rule the posted comment uses. */
function mentionDecorations(doc: ProseMirrorNode, resolved: ReadonlyMap<string, MentionKind>): DecorationSet {
  if (resolved.size === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, position) => {
    if (node.type.spec.code) return false;
    if (!node.isText) return true;
    if (!node.text || node.marks.some((mark) => mark.type.spec.code)) return false;
    let offset = position;
    for (const segment of splitMentions(node.text, resolved)) {
      if (segment.type === "mention") decorations.push(Decoration.inline(offset, offset + segment.value.length, { class: mentionClasses[segment.kind], "data-mention": segment.handle }));
      offset += segment.value.length;
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentMentions: {
      /** Who can be mentioned now: the list loads after the box, and the chips are drawn again when it arrives. */
      setMentionSource: (source: MentionSource) => ReturnType;
    };
  }
}

const noSource: MentionSource = { candidates: [], self: null, resolved: new Map() };

/**
 * @mentions in the rich comment box: suggestions while an "@handle" is typed
 * (keyboard and pointer), plain "@handle " text when one is picked (so the
 * Markdown and the server's mention parsing are as before), and chips on
 * handles that reach someone.
 */
export const CommentMentions = Extension.create<Record<string, never>, { source: MentionSource }>({
  name: "commentMentions",

  addStorage() {
    return { source: noSource };
  },

  addCommands() {
    return {
      setMentionSource: (next) => ({ tr, dispatch }) => {
        this.storage.source = next;
        if (dispatch) tr.setMeta(highlightKey, true);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const source = () => storage.source;
    listCount += 1;
    const listId = `comment-mentions-${String(listCount)}`;
    return [
      Suggestion<Mentionable, Mentionable>({
        pluginKey: suggestionKey,
        editor: this.editor,
        char: "@",
        allowedPrefixes: null,
        findSuggestionMatch: ({ $position }) => {
          const match = mentionMatchAt($position);
          return match ? { range: match.range, query: match.query.query, text: `@${match.query.query}` } : null;
        },
        items: ({ query }) => matchMentionables(source().candidates, query),
        command: ({ editor, props }) => { pickMention(editor, props.handle); },
        offset: { mainAxis: 4 },
        floatingUi: { middleware: [shift({ padding: 8 })] },
        render: () => renderMentionMenu(source, listId),
      }),
      new Plugin<DecorationSet>({
        key: highlightKey,
        state: {
          init: (_, state) => mentionDecorations(state.doc, source().resolved),
          apply: (tr, previous) => (tr.docChanged || tr.getMeta(highlightKey) ? mentionDecorations(tr.doc, source().resolved) : previous),
        },
        props: {
          decorations: (state) => highlightKey.getState(state),
        },
      }),
    ];
  },
});
