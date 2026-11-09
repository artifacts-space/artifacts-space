"use client";

import { IconColumnInsertLeft, IconColumnInsertRight, IconCursorText, IconTrash } from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";

import { type ColumnLayoutProps, ColumnLayoutOptions } from "@/components/artifact-view/column-layout-options";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

export type ColumnAction = "rename" | "insertLeft" | "insertRight" | "delete";

interface CsvEditMenuProps {
  onClose: () => void;
  anchor: () => Element | null;
  returnFocus: RefObject<HTMLElement | null>;
  name: string;
  onAction: (action: ColumnAction) => void;
  /** Move and fit options; an editor's moves change the file for everyone. */
  layout: ColumnLayoutProps;
}

/** A column's edit options in the grid editor: rename, add a column either side, move it, fit its width, or delete it. */
export function CsvEditMenu({ onClose, anchor, returnFocus, name, onAction, layout }: CsvEditMenuProps) {
  const run = (action: ColumnAction) => () => {
    onClose();
    onAction(action);
  };
  return (
    <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverContent anchor={anchor} finalFocus={returnFocus} className="w-60 p-1.5">
        <PopoverTitle className="truncate px-2 pt-1 pb-2">{name || "Untitled column"}</PopoverTitle>
        <MenuButton icon={<IconCursorText />} label="Rename column" onClick={run("rename")} />
        <MenuButton icon={<IconColumnInsertLeft />} label="Add column left" onClick={run("insertLeft")} />
        <MenuButton icon={<IconColumnInsertRight />} label="Add column right" onClick={run("insertRight")} />
        <Separator className="my-1.5" />
        <ColumnLayoutOptions {...layout} />
        <Separator className="my-1.5" />
        <MenuButton icon={<IconTrash />} label="Delete column" onClick={run("delete")} danger />
      </PopoverContent>
    </Popover>
  );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} className={danger ? "w-full justify-start font-normal text-destructive hover:text-destructive" : "w-full justify-start font-normal"}>
      {icon}
      {label}
    </Button>
  );
}
