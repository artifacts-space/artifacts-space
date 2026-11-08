import { PIXEL_GRID, PIXEL_TONES, pixelIcons, pixelPaths, type PixelIconName } from "@/lib/landing/pixel-icons";
import { cn } from "@/lib/utils";

const drawn = Object.fromEntries(Object.entries(pixelIcons).map(([name, rows]) => [name, pixelPaths(rows)]));

/**
 * A landing-page pixel icon in the brand blues. Decorative: the text beside
 * it says what it means. `size` should be a multiple of 16 so every cell
 * lands on whole pixels.
 */
export function PixelIcon({ name, size = 48, className }: { name: PixelIconName; size?: number; className?: string }) {
  const paths = drawn[name] ?? {};
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox={`0 0 ${String(PIXEL_GRID)} ${String(PIXEL_GRID)}`}
      shapeRendering="crispEdges"
      className={cn("shrink-0", className)}
    >
      {PIXEL_TONES.map((tone) => {
        const d = paths[tone];
        return d ? <path key={tone} d={d} style={{ fill: `var(--pixel-${tone})` }} /> : null;
      })}
    </svg>
  );
}
