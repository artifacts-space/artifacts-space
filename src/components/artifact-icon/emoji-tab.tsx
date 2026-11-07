"use client";

import { EmojiPicker, type EmojiPickerListCategoryHeaderProps, type EmojiPickerListEmojiProps, type EmojiPickerListRowProps } from "frimousse";
import { Component, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The Emoji tab of the icon picker, on frimousse. It is its own chunk,
 * loaded with next/dynamic only when the picker opens. Emoji data comes from
 * a pinned Emojibase release on jsDelivr and is cached by the browser.
 */

/** Pinned so the data never changes under us. frimousse reads `${url}/${locale}/data.json`. */
const EMOJIBASE_URL = "https://cdn.jsdelivr.net/npm/emojibase-data@17.0.0";

function CategoryHeader({ category, className, ...props }: EmojiPickerListCategoryHeaderProps) {
  return (
    <div className={cn("bg-popover px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground", className)} {...props}>
      {category.label}
    </div>
  );
}

function Row({ children, className, ...props }: EmojiPickerListRowProps) {
  return (
    <div className={cn("scroll-my-1.5 px-1.5", className)} {...props}>
      {children}
    </div>
  );
}

function EmojiButton({ emoji, className, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button
      type="button"
      className={cn("flex size-9 items-center justify-center rounded-lg text-xl data-[active]:bg-muted", className)}
      {...props}
    >
      {emoji.emoji}
    </button>
  );
}

const listComponents = { CategoryHeader, Row, Emoji: EmojiButton };

/** Shown when the emoji data cannot load, such as offline. */
class EmojiLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Emoji could not load. Check your connection, or pick from Icons.</p>;
  }
}

interface EmojiTabProps {
  onSelect: (emoji: string) => void;
}

/** Search, skin tone, and every Unicode emoji by category. Arrow keys move through the grid from the search box. */
export default function EmojiTab({ onSelect }: EmojiTabProps) {
  return (
    <EmojiLoadBoundary>
      <EmojiPicker.Root
        className="isolate flex h-80 w-full flex-col"
        columns={9}
        emojibaseUrl={EMOJIBASE_URL}
        onEmojiSelect={({ emoji }) => { onSelect(emoji); }}
      >
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
          <EmojiPicker.Search
            aria-label="Search emoji"
            placeholder="Search emoji"
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
          <EmojiPicker.SkinToneSelector
            aria-label="Change skin tone"
            title="Skin tone"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        </div>
        <EmojiPicker.Viewport className="relative flex-1 outline-none">
          <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading emoji…</EmojiPicker.Loading>
          <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No emoji match.</EmojiPicker.Empty>
          <EmojiPicker.List className="pb-1.5 select-none" components={listComponents} />
        </EmojiPicker.Viewport>
      </EmojiPicker.Root>
    </EmojiLoadBoundary>
  );
}
