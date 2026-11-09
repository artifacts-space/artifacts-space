"use client";

import { IconAlignCenter, IconAlignLeft, IconAlignRight, IconLayoutRows, IconWand } from "@tabler/icons-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";

import { setSheetFormatAction } from "@/app/(workspace)/app/sheet-format-actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  alignmentLabels,
  bandingLabels,
  plainSheetFormat,
  readSheetFormat,
  type SheetAlignmentChoice,
  type SheetBanding,
  sheetBandings,
  type SheetFormat,
  withBanding,
} from "@/lib/sheet-format/rules";
import { createSaveQueue } from "@/lib/sheet-format/save-queue";

/** A sheet's formatting, and the change handler when this viewer may edit it (null for readers). */
export interface SheetFormatControl {
  format: SheetFormat;
  onChange: ((next: SheetFormat) => void) | null;
}

const readOnlyPlain: SheetFormatControl = { format: plainSheetFormat, onChange: null };

/** The formatting of the sheet in view. Without a provider, sheets are plain and read-only. */
export const SheetFormatContext = createContext<SheetFormatControl>(readOnlyPlain);

/** The formatting of the sheet in view, and its change handler for editors. */
export function useSheetFormat(): SheetFormatControl {
  return useContext(SheetFormatContext);
}

/** Saves formatting; resolves to the saved formatting, or null when it did not save (and the saver told the person why). */
export type SheetFormatSaver = (next: SheetFormat) => Promise<SheetFormat | null>;

interface ProviderProps {
  /** The formatting as stored. A new value from the server replaces what is shown. */
  stored: SheetFormat;
  /** Null for readers: they see the formatting and cannot change it. */
  save: SheetFormatSaver | null;
  children: ReactNode;
}

/**
 * Holds a sheet's formatting. A change shows at once and saves in the
 * background, one save at a time so quick changes never overtake each
 * other; if a save fails, the last saved formatting comes back.
 */
export function SheetFormatProvider({ stored, save, children }: ProviderProps) {
  const [shown, setShown] = useState(stored);
  const [seen, setSeen] = useState(stored);
  // One save line per provider, for the life of the sheet.
  const [queue] = useState(() =>
    createSaveQueue<SheetFormat>(stored, {
      onSettled: setShown,
      onFailed: () => { toast.error("Something went wrong. Check your connection and try again."); },
    }),
  );
  if (seen !== stored) {
    setSeen(stored);
    setShown(stored);
    // What the server now holds is what a failed save rolls back to.
    queue.reset(stored);
  }

  const change = useCallback((next: SheetFormat) => {
    if (!save) return;
    setShown(next);
    queue.push(next, save);
  }, [save, queue]);

  const value = useMemo(() => ({ format: shown, onChange: save ? change : null }), [shown, save, change]);
  return <SheetFormatContext value={value}>{children}</SheetFormatContext>;
}

/**
 * A CSV artifact's formatting on its page and in the app: editors save
 * through the server (`artifactId`), readers (null) only see it.
 */
export function ArtifactSheetFormat({ artifactId, stored, children }: { artifactId: string | null; stored: unknown; children: ReactNode }) {
  const format = useMemo(() => readSheetFormat(stored), [stored]);
  const save = useMemo<SheetFormatSaver | null>(() => {
    if (artifactId === null) return null;
    return async (next) => {
      const result = await setSheetFormatAction(artifactId, next);
      if (result.success) return result.data;
      toast.error(result.error);
      return null;
    };
  }, [artifactId]);
  return <SheetFormatProvider stored={format} save={save}>{children}</SheetFormatProvider>;
}

/** The toolbar's Format menu for editors: banded rows, in a tint from the theme. */
export function SheetFormatMenu() {
  const { format, onChange } = useSheetFormat();
  if (!onChange) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" aria-label="Banding" />}>
        <IconLayoutRows /> <span className="hidden sm:inline">Banding</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Banded rows</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={format.banding ?? "off"} onValueChange={(value: SheetBanding | "off") => { onChange(withBanding(format, value === "off" ? null : value)); }}>
            <DropdownMenuRadioItem value="off" closeOnClick className="py-2">Off</DropdownMenuRadioItem>
            {sheetBandings.map((banding) => (
              <DropdownMenuRadioItem key={banding} value={banding} closeOnClick className="py-2">{bandingLabels[banding]}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A column's alignment control, for its menu. */
export interface ColumnAlignControl {
  value: SheetAlignmentChoice;
  onChange: (choice: SheetAlignmentChoice) => void;
}

const alignIcons: Record<SheetAlignmentChoice, ReactNode> = {
  auto: <IconWand />,
  left: <IconAlignLeft />,
  center: <IconAlignCenter />,
  right: <IconAlignRight />,
};

const alignChoices: readonly SheetAlignmentChoice[] = ["auto", "left", "center", "right"];

/** Auto, left, center, or right for one column, as four toggle buttons. Auto puts numbers right and text left. */
export function ColumnAlignOptions({ value, onChange }: ColumnAlignControl) {
  return (
    <div role="group" aria-label="Align column" className="flex items-center gap-1 px-2 py-1">
      <span className="mr-auto text-sm">Align</span>
      {alignChoices.map((choice) => (
        <Button
          key={choice}
          type="button"
          variant={value === choice ? "secondary" : "ghost"}
          size="icon-sm"
          aria-pressed={value === choice}
          aria-label={choice === "auto" ? "Align automatically" : `Align ${alignmentLabels[choice].toLowerCase()}`}
          title={alignmentLabels[choice]}
          onClick={() => { onChange(choice); }}
        >
          {alignIcons[choice]}
        </Button>
      ))}
    </div>
  );
}
