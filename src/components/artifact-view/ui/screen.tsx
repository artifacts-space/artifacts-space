"use client";

import { IconBuildingStore, IconMapPin, IconPhoto, IconPlayerPlay, IconUser, type TablerIcon } from "@tabler/icons-react";

import type { UiProps } from "@/lib/ui/catalog";
import type { AspectRatio, Radius } from "@/lib/ui/props/shared";
import { cn } from "@/lib/utils";

import { badgeTone, inkToneClass } from "./content";
import { uiIconComponents } from "./icon-glyphs";
import { radiusClass, ratioClass } from "./scales";
import type { ViewProps } from "./stout";

const iconSize: Record<NonNullable<UiProps<"Icon">["size"]>, string> = { xs: "size-3.5", sm: "size-4", md: "size-5", lg: "size-6", xl: "size-8" };

/** An icon in the text color. Decorative unless it has a label, which then names it as an image. */
export function IconView({ props }: ViewProps<"Icon">) {
  const Glyph = uiIconComponents[props.name];
  const named = props.label ? { role: "img", "aria-label": props.label } : { "aria-hidden": true };
  return <Glyph {...named} className={cn("shrink-0", iconSize[props.size ?? "md"], inkToneClass[props.tone ?? "default"])} stroke={props.size === "xl" ? 1.5 : 2} />;
}

type PlaceholderProps = UiProps<"Placeholder">;
type PlaceholderVariant = NonNullable<PlaceholderProps["variant"]>;


/** Each variant's mark, what a screen reader calls it without a label, and its shape: fills the width at a ratio, or a small fixed box. */
const placeholderVariant: Record<PlaceholderVariant, { Glyph: TablerIcon; name: string; ratio: AspectRatio | null; box: string; radius: Radius }> = {
  image: { Glyph: IconPhoto, name: "Image placeholder", ratio: "video", box: "w-full", radius: "md" },
  video: { Glyph: IconPlayerPlay, name: "Video placeholder", ratio: "video", box: "w-full", radius: "md" },
  map: { Glyph: IconMapPin, name: "Map placeholder", ratio: "video", box: "w-full", radius: "md" },
  logo: { Glyph: IconBuildingStore, name: "Logo placeholder", ratio: null, box: "h-8 w-28 shrink-0", radius: "sm" },
  avatar: { Glyph: IconUser, name: "Avatar placeholder", ratio: null, box: "size-10 shrink-0", radius: "full" },
};

/** The ratio a placeholder takes: its own, or its variant's; small fixed boxes (logo, avatar) take one only when asked. */
function placeholderShape(props: PlaceholderProps): string {
  const variant = placeholderVariant[props.variant ?? "image"];
  const ratio = props.ratio ?? variant.ratio;
  if (!ratio) return variant.box;
  return cn(ratioClass[ratio], variant.ratio ? variant.box : "w-full");
}

/** The stand-in itself: a named image with a mark and, when there is room, its label. */
function StandIn({ props, className }: { props: PlaceholderProps; className: string }) {
  const variant = placeholderVariant[props.variant ?? "image"];
  const small = variant.ratio === null && props.ratio === undefined;
  return (
    <div role="img" aria-label={props.label ?? variant.name} className={cn("flex min-w-0 flex-col items-center justify-center gap-2 overflow-hidden bg-muted text-muted-foreground", className)}>
      <variant.Glyph aria-hidden className={small ? "size-4" : "size-6"} stroke={1.5} />
      {props.label && !small ? <span className="max-w-full truncate px-3 text-xs">{props.label}</span> : null}
    </div>
  );
}

/** A browser window drawn around the stand-in: a bar with three dots and an address pill. All of it is decoration. */
function BrowserFrame({ props }: { props: PlaceholderProps }) {
  return (
    <div data-frame="browser" className="w-full min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm">
      <div aria-hidden className="flex items-center gap-1.5 border-b bg-muted px-3 py-2">
        <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
        <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
        <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
        <span className="mx-auto h-4 w-3/5 max-w-64 rounded-full bg-background" />
      </div>
      <StandIn props={props} className={cn("w-full", ratioClass[props.ratio ?? "video"])} />
    </div>
  );
}

/** A phone drawn around the stand-in: a rounded body with a speaker slot. All of it is decoration. */
function PhoneFrame({ props }: { props: PlaceholderProps }) {
  return (
    <div data-frame="phone" className="w-full max-w-64 min-w-0 rounded-4xl border bg-card p-2 shadow-sm">
      <div aria-hidden className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/40" />
      <StandIn props={props} className={cn("w-full rounded-3xl", ratioClass[props.ratio ?? "portrait"])} />
    </div>
  );
}

/** A neutral stand-in for an image, video, map, logo, or avatar, so a mockup needs no upload. A frame draws a window or a phone around a picture-sized one. */
export function PlaceholderView({ props }: ViewProps<"Placeholder">) {
  const variant = placeholderVariant[props.variant ?? "image"];
  const framed = variant.ratio !== null ? props.frame : undefined;
  if (framed === "browser") return <BrowserFrame props={props} />;
  if (framed === "phone") return <PhoneFrame props={props} />;
  return <StandIn props={props} className={cn("border border-dashed", placeholderShape(props), radiusClass[props.radius ?? variant.radius])} />;
}

const avatarSize: Record<NonNullable<UiProps<"Avatar">["size"]>, string> = { sm: "size-6 text-xs", md: "size-8 text-xs", lg: "size-10 text-sm", xl: "size-14 text-lg" };

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/** The first letter of the first two words, as written: "Maya Chen" is "MC". Empty when the name has no letters or digits. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  return words.slice(0, 2).map((word) => graphemes.segment(word)[Symbol.iterator]().next().value?.segment ?? "").join("").toUpperCase();
}

/** A round avatar with a person's initials, tinted by tone. The name is its accessible name. */
export function AvatarView({ props }: ViewProps<"Avatar">) {
  const initials = initialsOf(props.name);
  return (
    <span role="img" aria-label={props.name} className={cn("inline-flex shrink-0 items-center justify-center rounded-full border font-medium select-none", avatarSize[props.size ?? "md"], badgeTone[props.tone ?? "neutral"])}>
      {initials ? <span aria-hidden>{initials}</span> : <IconUser aria-hidden className="size-1/2" />}
    </span>
  );
}
