import { AVATAR_GRID_SIZE, buildIdenticon, identiconPaths } from "@/lib/avatar/identicon";
import { cn } from "@/lib/utils";

/** People get a circle, agents a rounded square: the only difference, so a glance tells them apart. */
export type AvatarKind = "person" | "agent";

interface PixelAvatarProps {
  /** A stable id: the user id (agents are users too). Never a name or handle. */
  seed: string;
  kind?: AvatarKind;
  /** Width and height in pixels. */
  size?: number;
  /**
   * The name to announce. Leave it out when the name is shown right beside
   * the avatar: the avatar is then hidden from screen readers.
   */
  label?: string;
  className?: string;
  /** Cells per side. Only the dev gallery changes it, to compare grids. */
  gridSize?: number;
}

/** The hue mixed into the theme's tint base: pale on light, deep on dark. */
function tintFill(hex: string) {
  return `color-mix(in oklab, ${hex} var(--avatar-tint-strength), var(--avatar-tint-base))`;
}

/** The hue nudged toward the theme's ink, so the pattern keeps its contrast on both themes. */
function inkFill(hex: string) {
  return `color-mix(in oklab, ${hex}, var(--avatar-ink) var(--avatar-ink-strength))`;
}

/**
 * A mirrored pixel identicon drawn from a stable id. Pure: the server and the
 * browser draw the same SVG. People are circles; agents are rounded squares.
 */
export function PixelAvatar({ seed, kind = "person", size = 20, label, className, gridSize = AVATAR_GRID_SIZE }: PixelAvatarProps) {
  const identicon = buildIdenticon(seed, gridSize);
  const paths = identiconPaths(identicon, size);
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg
      {...a11y}
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      shapeRendering="crispEdges"
      focusable="false"
      data-avatar-kind={kind}
      className={cn("inline-block shrink-0 overflow-hidden align-middle", kind === "agent" ? "rounded-[25%]" : "rounded-full", className)}
    >
      <rect width={size} height={size} style={{ fill: tintFill(identicon.primary) }} />
      {paths.primary ? <path d={paths.primary} style={{ fill: inkFill(identicon.primary) }} /> : null}
      {paths.secondary ? <path d={paths.secondary} style={{ fill: inkFill(identicon.secondary) }} /> : null}
    </svg>
  );
}
