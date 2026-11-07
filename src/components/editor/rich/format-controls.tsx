"use client";

import { IconBold, IconCheck, IconCode, IconItalic, IconLink, IconLinkOff, IconStrikethrough, IconX, type Icon } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { readLinkInput } from "./link-input";

interface ToolButtonProps {
  icon: Icon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** An icon button for editor menus, with its name and shortcut in a tooltip. */
export function ToolButton({ icon: ButtonIcon, label, shortcut, active = false, disabled = false, onPress }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onMouseDown={(event) => { event.preventDefault(); }}
            onClick={onPress}
            className={cn(active && "bg-muted text-foreground")}
          />
        }
      >
        <ButtonIcon aria-hidden />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="text-background/70">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl+";

function useMarks(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      link: current.isActive("link"),
    }),
  });
}

/** Bold, italic, strikethrough, inline code, and link, for the selection. */
export function FormatButtons({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const marks = useMarks(editor);
  return (
    <>
      <ToolButton icon={IconBold} label="Bold" shortcut={`${mod}B`} active={marks.bold} onPress={() => { editor.chain().focus().toggleBold().run(); }} />
      <ToolButton icon={IconItalic} label="Italic" shortcut={`${mod}I`} active={marks.italic} onPress={() => { editor.chain().focus().toggleItalic().run(); }} />
      <ToolButton icon={IconStrikethrough} label="Strikethrough" shortcut={`${mod}⇧S`} active={marks.strike} onPress={() => { editor.chain().focus().toggleStrike().run(); }} />
      <ToolButton icon={IconCode} label="Code" shortcut={`${mod}E`} active={marks.code} onPress={() => { editor.chain().focus().toggleCode().run(); }} />
      <ToolButton icon={IconLink} label={marks.link ? "Edit link" : "Link"} shortcut={`${mod}K`} active={marks.link} onPress={onLink} />
    </>
  );
}

function currentHref(editor: Editor): string {
  const href: unknown = editor.getAttributes("link").href;
  return typeof href === "string" ? href : "";
}

/** Applies a typed link to the selection, or the whole link under the cursor. */
function applyLink(editor: Editor, href: string) {
  const chain = editor.chain().focus();
  if (editor.state.selection.empty && editor.isActive("link")) chain.extendMarkRange("link");
  chain.setLink({ href }).run();
}

function removeLink(editor: Editor) {
  editor.chain().focus().extendMarkRange("link").unsetLink().run();
}

/**
 * Edits the link on the selection. Enter applies, Escape cancels, and an
 * empty field removes the link. Unsafe URLs such as `javascript:` are refused
 * with a message, never applied.
 */
export function LinkEditor({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [value, setValue] = useState(() => currentHref(editor));
  const [error, setError] = useState("");
  const hasLink = editor.isActive("link");
  const errorId = useId();

  function submit() {
    const result = readLinkInput(value);
    if (result.kind === "invalid") {
      setError("Use a web or email link, such as https://example.com.");
      return;
    }
    if (result.kind === "remove") removeLink(editor);
    else applyLink(editor, result.href);
    onDone();
  }

  function cancel() {
    editor.commands.focus();
    onDone();
  }

  return (
    <div className="flex w-[min(22rem,calc(100vw-24px))] flex-col gap-1 p-0.5">
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={value}
          onChange={(event) => { setValue(event.target.value); setError(""); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); submit(); }
            if (event.key === "Escape") { event.preventDefault(); cancel(); }
          }}
          placeholder="Paste or type a link"
          aria-label="Link address"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-8 min-w-0 flex-1"
        />
        <ToolButton icon={IconCheck} label="Apply link" onPress={submit} />
        {hasLink ? <ToolButton icon={IconLinkOff} label="Remove link" onPress={() => { removeLink(editor); onDone(); }} /> : null}
        <ToolButton icon={IconX} label="Cancel" onPress={cancel} />
      </div>
      {error ? <p id={errorId} role="alert" className="px-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
