"use client";

import { IconLoader2, IconTrash } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseArtifactIcon } from "@/lib/artifact-icons";

import { TablerTab } from "./tabler-tab";

/** frimousse and its list load only when the picker opens on the Emoji tab. */
const EmojiTab = dynamic(() => import("./emoji-tab"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground" role="status">
      <IconLoader2 aria-hidden className="mr-2 size-4 animate-spin" /> Loading emoji…
    </div>
  ),
});

type PickerTab = "emoji" | "icons";

interface IconPickerProps {
  /** The stored icon, or null. */
  value: string | null;
  /** Called with the new icon, or null to remove it. The picker closes first. */
  onChange: (icon: string | null) => void;
  /** The button that opens the picker, as a Base UI render element. */
  trigger: React.ReactElement;
  disabled?: boolean;
  align?: "start" | "center" | "end";
}

/**
 * A Notion-style icon picker: Emoji and Icons tabs, search in each, and
 * Remove. A popover that spans the screen on phones.
 */
export function IconPicker({ value, onChange, trigger, disabled = false, align = "start" }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>(() => (parseArtifactIcon(value)?.type === "tabler" ? "icons" : "emoji"));

  function choose(icon: string | null) {
    setOpen(false);
    if (icon !== value) onChange(icon);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} disabled={disabled} />
      <PopoverContent align={align} sideOffset={8} className="w-[calc(100vw-2rem)] overflow-hidden p-0 sm:w-[22rem]">
        <PopoverTitle className="sr-only">Choose an icon</PopoverTitle>
        <Tabs value={tab} onValueChange={(next: PickerTab) => { setTab(next); }} className="gap-0">
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <TabsList variant="line" className="h-8">
              <TabsTrigger value="emoji">Emoji</TabsTrigger>
              <TabsTrigger value="icons">Icons</TabsTrigger>
            </TabsList>
            {value ? (
              <Button type="button" variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => { choose(null); }}>
                <IconTrash /> Remove
              </Button>
            ) : null}
          </div>
          <TabsContent value="emoji">{open && tab === "emoji" ? <EmojiTab onSelect={choose} /> : null}</TabsContent>
          <TabsContent value="icons">{open && tab === "icons" ? <TablerTab value={value} onSelect={choose} /> : null}</TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
