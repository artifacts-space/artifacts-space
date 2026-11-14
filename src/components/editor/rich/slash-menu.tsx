"use client";

import { shift, size } from "@floating-ui/dom";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useImperativeHandle, useState } from "react";

import { cn } from "@/lib/utils";

import { filterSlashCommands, runSlashCommand, slashCommands, type SlashCommand } from "./slash-commands";

const listboxId = "rich-editor-slash-menu";

function optionId(index: number) {
  return `${listboxId}-option-${String(index)}`;
}

/** What the slash menu exposes to the suggestion plugin. */
export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashMenuProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
  onActive: (index: number) => void;
  ref?: React.Ref<SlashMenuHandle>;
}

function nextIndex(key: string, current: number, count: number): number | null {
  if (key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * Scrolls the list, and only the list, until the highlighted option shows.
 * Focus stays in the document, so the browser never does it on its own.
 */
function revealOption(index: number) {
  const option = document.getElementById(optionId(index));
  const list = option?.closest("[data-slot=slash-menu]");
  if (!option || !(list instanceof HTMLElement)) return;
  const shown = list.getBoundingClientRect();
  const box = option.getBoundingClientRect();
  if (box.top < shown.top) list.scrollTop -= shown.top - box.top;
  else if (box.bottom > shown.bottom) list.scrollTop += box.bottom - shown.bottom;
}

/**
 * The list under a typed slash. Focus stays in the document; arrow keys move
 * the highlight (scrolled into view), Enter or Tab inserts, Escape closes.
 * The document's `aria-activedescendant` points at the highlighted option.
 */
function SlashMenuList({ items, command, onActive, ref }: SlashMenuProps) {
  const [active, setActive] = useState(0);
  const [itemsSeen, setItemsSeen] = useState(items);
  if (itemsSeen !== items) {
    setItemsSeen(items);
    setActive(0);
  }

  useEffect(() => { onActive(items.length > 0 ? active : -1); }, [active, items.length, onActive]);
  useEffect(() => { revealOption(active); }, [active, items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      const moved = nextIndex(event.key, active, items.length);
      if (moved !== null) {
        setActive(moved);
        return true;
      }
      if (event.key !== "Enter" && event.key !== "Tab") return false;
      const item = items[active];
      if (item) command(item);
      return true;
    },
  }), [active, command, items]);

  if (items.length === 0) {
    return <p className="px-2.5 py-2 text-sm text-muted-foreground">No blocks match.</p>;
  }
  return (
    <div id={listboxId} role="listbox" aria-label="Insert a block" className="flex flex-col">
      {items.map((item, index) => (
        <div
          key={item.id}
          id={optionId(index)}
          role="option"
          aria-selected={index === active}
          onMouseDown={(event) => { event.preventDefault(); }}
          onMouseEnter={() => { setActive(index); }}
          onClick={() => { command(item); }}
          className={cn(
            "flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm select-none",
            index === active ? "bg-accent text-accent-foreground" : "text-popover-foreground",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <item.icon className="size-4" aria-hidden />
          </span>
          <span className="flex-1">{item.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{item.hint}</span>
        </div>
      ))}
    </div>
  );
}

/** The shared popover look for editor menus: popover tokens and the menu shadow. */
export const floatingMenuClass =
  "z-50 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none";

/**
 * Which list the editor's suggestions are in and which one is highlighted,
 * for screen readers. The editor keeps the textbox role, which supports
 * `aria-autocomplete`, `aria-controls`, and `aria-activedescendant` but not
 * `aria-expanded` (as in the comment box's mention list).
 */
function setComboboxState(editor: Editor, activeIndex: number) {
  const dom = editor.view.dom;
  if (activeIndex >= 0) {
    dom.setAttribute("aria-controls", listboxId);
    dom.setAttribute("aria-activedescendant", optionId(activeIndex));
    return;
  }
  dom.removeAttribute("aria-controls");
  dom.removeAttribute("aria-activedescendant");
}

type SlashProps = SuggestionProps<SlashCommand, SlashCommand>;

function menuProps(props: SlashProps) {
  return {
    items: props.items,
    command: (item: SlashCommand) => { props.command(item); },
    onActive: (index: number) => { setComboboxState(props.editor, index); },
  };
}

/** Mounts the slash menu in the page body; the plugin places it under the typed slash. */
function renderSlashMenu(): ReturnType<NonNullable<SuggestionOptions<SlashCommand, SlashCommand>["render"]>> {
  let renderer: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;
  let unmount: (() => void) | null = null;
  return {
    onStart: (props) => {
      renderer = new ReactRenderer(SlashMenuList, { props: menuProps(props), editor: props.editor, className: cn(floatingMenuClass, "min-w-60 max-w-[calc(100vw-16px)] overflow-y-auto") });
      renderer.element.setAttribute("data-slot", "slash-menu");
      unmount = props.mount(renderer.element);
    },
    onUpdate: (props) => { renderer?.updateProps(menuProps(props)); },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => renderer?.ref?.onKeyDown(event) ?? false,
    onExit: (props) => {
      unmount?.();
      renderer?.destroy();
      renderer = null;
      unmount = null;
      setComboboxState(props.editor, -1);
    },
  };
}

/** Keeps the menu on screen on a phone and short enough to fit under the line. */
const menuMiddleware = [
  shift({ padding: 8 }),
  size({
    padding: 8,
    apply: ({ availableHeight, elements }) => {
      elements.floating.style.maxHeight = `${String(Math.max(160, Math.min(availableHeight, 352)))}px`;
    },
  }),
];

function allowSlash({ editor }: { editor: Editor; range: Range }) {
  return !editor.isActive("codeBlock");
}

/**
 * Typing `/` opens a menu of blocks to insert: headings, lists, task list,
 * quote, code block, table, divider, and media (image, video, audio, PDF,
 * file). Typing filters it. The `commands` option narrows the menu, as for
 * editors without media.
 */
export const SlashCommandExtension = Extension.create<{ commands: readonly SlashCommand[] }>({
  name: "slashCommand",

  addOptions() {
    return { commands: slashCommands };
  },

  addProseMirrorPlugins() {
    const commands = this.options.commands;
    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        allow: allowSlash,
        items: ({ query }) => filterSlashCommands(query, commands),
        command: ({ editor, range, props }) => { runSlashCommand(editor, range, props); },
        offset: { mainAxis: 6 },
        floatingUi: { middleware: menuMiddleware },
        render: renderSlashMenu,
      }),
    ];
  },
});
