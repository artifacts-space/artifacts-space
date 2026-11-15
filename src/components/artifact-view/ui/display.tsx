import { IconStar, IconStarFilled } from "@tabler/icons-react";

import type { UiProps } from "@/lib/ui/catalog";
import { avatarGroupName, avatarGroupShape, kbdWords, ratingWords, scoreText } from "@/lib/ui/display-words";
import { cn } from "@/lib/utils";

import { AvatarFace, avatarClassName, initialsOf } from "./screen";
import type { ViewProps } from "./stout";

/*
 * Display-only pieces of a screen: a row of overlapping avatars, a keyboard
 * shortcut, and a star rating. Each is one thing to a screen reader, named
 * in words (src/lib/ui/display-words.ts); what is drawn is hidden from it.
 */

type GroupSize = NonNullable<UiProps<"AvatarGroup">["size"]>;

/** How far each circle tucks under the one before it, by size. */
const overlap: Record<GroupSize, string> = { sm: "-ml-1.5", md: "-ml-2", lg: "-ml-2.5", xl: "-ml-3.5" };

/** The "+N" count is as tall as a circle and at least as wide, growing with its digits. */
const countWidth: Record<GroupSize, string> = { sm: "min-w-6", md: "min-w-8", lg: "min-w-10", xl: "min-w-14" };

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** The disc of the page color under each circle, with a ring of it: a tint never shows the circle under it, and reads as an Avatar on the page does. */
const disc = "rounded-full bg-background ring-2 ring-background";

/** A row of overlapping avatars and a "+N" count, named once for screen readers. */
export function AvatarGroupView({ props }: ViewProps<"AvatarGroup">) {
  const { shown, more } = avatarGroupShape(props.people, props.max, props.total);
  const size = props.size ?? "md";
  return (
    <span role="img" aria-label={avatarGroupName(props.people, props.max, props.total)} className="inline-flex max-w-full items-center pl-0.5">
      {shown.map((person, index) => (
        <span key={`${String(index)}-${person.name}`} data-avatar-person="" className={cn(disc, index > 0 && overlap[size])}>
          <span className={avatarClassName(size, person.tone)}>
            <AvatarFace letters={person.initials?.toUpperCase() ?? initialsOf(person.name)} />
          </span>
        </span>
      ))}
      {more > 0 ? (
        <span data-avatar-more="" className={cn(disc, overlap[size])}>
          <span aria-hidden className={cn(avatarClassName(size, "neutral"), "w-auto px-1.5 tabular-nums", countWidth[size])}>+{more >= 1000 ? compact.format(more) : String(more)}</span>
        </span>
      ) : null}
    </span>
  );
}

/** A keyboard shortcut drawn as keys and read as words. */
export function KbdView({ props }: ViewProps<"Kbd">) {
  return (
    <span className="inline-flex w-fit max-w-full flex-wrap items-center gap-1">
      <span className="sr-only">{kbdWords(props.keys)}</span>
      {props.keys.map((key, index) => (
        <kbd key={`${String(index)}-${key}`} aria-hidden className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 bg-muted px-1.5 font-mono text-xs leading-none text-foreground">
          {key}
        </kbd>
      ))}
    </span>
  );
}

const starSize: Record<NonNullable<UiProps<"Rating">["size"]>, string> = { sm: "size-3.5", md: "size-4", lg: "size-5" };

/** One star: filled, half filled, or empty. A filled part is the warning tone; an empty part is an outline in the muted text color. */
function Star({ fill, size }: { fill: number; size: string }) {
  return (
    <span data-star={fill >= 1 ? "full" : fill <= 0 ? "empty" : "half"} className={cn("relative inline-block shrink-0", size)}>
      {fill < 1 ? <IconStar className={cn("absolute inset-0 text-muted-foreground", size)} /> : null}
      {fill > 0 ? (
        <span className={cn("absolute inset-y-0 left-0 overflow-hidden", fill >= 1 ? "w-full" : "w-1/2")}>
          <IconStarFilled className={cn("text-tone-warning", size)} />
        </span>
      ) : null}
    </span>
  );
}

/** A star rating to look at. It is one image to screen readers, named "4.5 out of 5". */
export function RatingView({ props }: ViewProps<"Rating">) {
  const max = props.max ?? 5;
  const size = starSize[props.size ?? "md"];
  return (
    <span role="img" aria-label={ratingWords(props.value, max, props.label)} className="inline-flex w-fit items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: max }, (_, index) => <Star key={index} fill={Math.min(1, Math.max(0, props.value - index))} size={size} />)}
      </span>
      {props.showValue ? <span className="text-sm font-medium tabular-nums">{scoreText(props.value)}</span> : null}
    </span>
  );
}
