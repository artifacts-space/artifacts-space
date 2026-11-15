import type { AspectRatio, Radius } from "@/lib/ui/props/shared";

/** Classes for the scales several views share. */

/** Corner rounding by step. */
export const radiusClass: Record<Radius, string> = { none: "rounded-none", sm: "rounded-sm", md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", full: "rounded-full" };

/** Width to height shapes for images and placeholders. */
export const ratioClass: Record<AspectRatio, string> = { square: "aspect-square", photo: "aspect-4/3", video: "aspect-video", wide: "aspect-21/9", portrait: "aspect-3/4" };
