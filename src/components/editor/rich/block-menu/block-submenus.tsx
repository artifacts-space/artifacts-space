"use client";

import { IconCheck, IconChevronLeft } from "@tabler/icons-react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { blockHues, colorChoiceLabel, type BlockColorPart, type BlockColors, type BlockHue } from "@/lib/block-colors/block-color-rules";
import { cn } from "@/lib/utils";

import { rowClass } from "./block-menu-parts";
import { blockTypes } from "./block-types";

/*
 * The block menu's submenus, Change and Color: lists of choices with a
 * check on the current one. Beside the menu on wider screens; in its place,
 * with a way back, on phones.
 */

const subRowClass = cn(rowClass, "focus:bg-accent focus:text-accent-foreground");

/** Moves focus between the submenu's rows with the arrow keys, Home, and End. */
function moveFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null): boolean {
  const rows = [...(container?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
  const current = rows.findIndex((row) => row === document.activeElement);
  const steps: Record<string, number> = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: rows.length - 1 };
  const next = steps[event.key];
  if (next === undefined || rows.length === 0) return false;
  rows[(next + rows.length) % rows.length]?.focus();
  return true;
}

interface SubmenuOption {
  key: string;
  label: string;
  /** The accessible name, when the shown label leans on its section's label. */
  name?: string;
  icon: ReactNode;
  checked: boolean;
  onPick: () => void;
}

interface SubmenuSection {
  /** A label over the section, when the submenu has more than one. */
  label?: string;
  options: readonly SubmenuOption[];
}

/** Where a submenu goes and how it hands focus back. */
export interface SubmenuFrame {
  panelRef: RefObject<HTMLDivElement | null>;
  className: string;
  focused: boolean;
  /** Phones show the submenu in place of the menu, with a way back. */
  sheet: boolean;
  onBack: () => void;
  onCloseAll: () => void;
}

interface SubmenuProps extends SubmenuFrame {
  title: string;
  slot: string;
  sections: readonly SubmenuSection[];
}

function OptionRow({ option }: { option: SubmenuOption }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={option.checked} aria-label={option.name} tabIndex={-1} onClick={option.onPick} className={subRowClass}>
      {option.icon}
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      <IconCheck aria-hidden className={cn("ml-auto text-foreground!", option.checked ? "visible" : "invisible")} />
    </button>
  );
}

/** A submenu: its sections of choices, keyboard movement, ← or Escape back to the menu, Tab out. */
function Submenu({ panelRef, className, focused, sheet, onBack, onCloseAll, title, slot, sections }: SubmenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]");
    const checked = listRef.current?.querySelector<HTMLElement>("[aria-checked=true]");
    (checked ?? rows?.[0])?.focus({ preventScroll: true });
  }, [focused]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (moveFocus(event, listRef.current)) {
      event.preventDefault();
    } else if (event.key === "ArrowLeft" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onBack();
    } else if (event.key === "Tab") {
      event.preventDefault();
      onCloseAll();
    }
  };

  return (
    <div ref={panelRef} className={className} onKeyDown={onKeyDown} data-slot={slot}>
      {sheet ? (
        <button type="button" onClick={onBack} className={cn(rowClass, "text-muted-foreground")}>
          <IconChevronLeft aria-hidden /> {title}
        </button>
      ) : null}
      <div ref={listRef} role="menu" aria-label={title} className="flex flex-col">
        {sections.map((section, index) => (
          <div key={section.label ?? index} role="group" aria-label={section.label} className="flex flex-col">
            {section.label ? <div aria-hidden className="px-2 pt-1.5 pb-0.5 text-xs text-muted-foreground">{section.label}</div> : null}
            {section.options.map((option) => <OptionRow key={option.key} option={option} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Change": every block type, each with its icon, and a check on the current one. */
export function ChangeSubmenu({ currentType, onPick, ...frame }: SubmenuFrame & { currentType: string | null; onPick: (typeId: string) => void }) {
  const options = blockTypes.map((option) => {
    const Icon = option.icon;
    return { key: option.id, label: option.label, icon: <Icon aria-hidden />, checked: option.id === currentType, onPick: () => { onPick(option.id); } };
  });
  return <Submenu {...frame} title="Change to" slot="block-menu-change" sections={[{ options }]} />;
}

/** A sample of a color: an "A" in the text color, or on the background. */
function Swatch({ part, hue }: { part: BlockColorPart; hue: BlockHue | null }) {
  const attributes = hue ? { [part === "color" ? "data-block-color" : "data-block-background"]: hue } : {};
  return (
    <span aria-hidden {...attributes} className="grid size-5 shrink-0 place-items-center rounded-md border text-xs font-semibold">
      {part === "color" || hue ? "A" : null}
    </span>
  );
}

/** "Color": Default and each hue, for the text and for the background, with a check on the current ones. */
export function ColorSubmenu({ colors, onPick, ...frame }: SubmenuFrame & { colors: BlockColors; onPick: (part: BlockColorPart, hue: BlockHue | null) => void }) {
  const hues: readonly (BlockHue | null)[] = [null, ...blockHues];
  const section = (part: BlockColorPart, label: string): SubmenuSection => ({
    label,
    options: hues.map((hue) => ({
      key: `${part}:${hue ?? "default"}`,
      label: colorChoiceLabel(part, hue, "inSection"),
      name: colorChoiceLabel(part, hue),
      icon: <Swatch part={part} hue={hue} />,
      checked: colors[part] === hue,
      onPick: () => { onPick(part, hue); },
    })),
  });
  return <Submenu {...frame} title="Color" slot="block-menu-color" sections={[section("color", "Text color"), section("background", "Background")]} />;
}
