"use client";

import { IconBuildingStore, IconMapPin, IconPhoto, IconPlayerPlay, IconUser, type TablerIcon } from "@tabler/icons-react";

import type { UiProps } from "@/lib/ui/catalog";
import type { AspectRatio, Radius } from "@/lib/ui/props/shared";
import { cn } from "@/lib/utils";

import { inkToneClass } from "./content";
import { uiIconComponents } from "./icon-glyphs";
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

const ratioClass: Record<AspectRatio, string> = { square: "aspect-square", photo: "aspect-4/3", video: "aspect-video", wide: "aspect-21/9", portrait: "aspect-3/4" };
const placeholderRadius: Record<Radius, string> = { none: "rounded-none", sm: "rounded-sm", md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", full: "rounded-full" };

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

/** A neutral stand-in for an image, video, map, logo, or avatar, so a mockup needs no upload. */
export function PlaceholderView({ props }: ViewProps<"Placeholder">) {
  const variant = placeholderVariant[props.variant ?? "image"];
  const small = variant.ratio === null && props.ratio === undefined;
  return (
    <div
      role="img"
      aria-label={props.label ?? variant.name}
      className={cn("flex min-w-0 flex-col items-center justify-center gap-2 overflow-hidden border border-dashed bg-muted text-muted-foreground", placeholderShape(props), placeholderRadius[props.radius ?? variant.radius])}
    >
      <variant.Glyph aria-hidden className={small ? "size-4" : "size-6"} stroke={1.5} />
      {props.label && !small ? <span className="max-w-full truncate px-3 text-xs">{props.label}</span> : null}
    </div>
  );
}
