import Link from "next/link";

import { RING, RING_TILT, SHEEN_BANDS, sheenWedge } from "@/lib/logo-sheen";
import { cn } from "@/lib/utils";

import "./logo.css";

/*
 * The mark's artwork in grid cells (one unit per pixel of the 27 by 20 grid),
 * traced from public/artifacts-space-mark.svg. The ring is its own layer so a
 * highlight can be clipped to it; the planet is drawn after it.
 */
const RING_SPARKS = "M22.25 7.15h.7v.7h-.7zM21.3 8.15h.7v.7h-.7zM20.45 9.15h.7v.7h-.7zM20.05 10.15h.5v.45h-.5z";

const PLANET: readonly { tone: string; d: string }[] = [
  { tone: "base", d: "M11 3h6v1h-6zM9 4h2v1h-2zM8 5h2v1h-2zM7 6h2v1h-2zM6 7h2v1h-2zM6 8h1v3h-1z" },
  {
    tone: "shade",
    d: "M16 4h2v1h-2zM17 5h2v1h-2zM18 6h2v1h-2zM19 7h1v1h-1zM19 8h2v1h-2zM19 9h1v2h-1zM6 11h1v2h-1zM19 11h2v1h-2zM17 12h1v1h-1zM19 12h1v1h-1zM6 13h2v1h-2zM16 13h1v1h-1zM18 13h2v1h-2zM7 14h2v1h-2zM15 14h1v1h-1zM17 14h2v1h-2zM8 15h2v1h-2zM14 15h1v1h-1zM16 15h2v1h-2zM9 16h3v1h-3zM13 16h1v1h-1zM16 16h1v1h-1zM12 17h4v1h-4z",
  },
  {
    tone: "mid",
    d: "M15 5h1v1h-1zM16 6h1v1h-1zM15 7h1v1h-1zM17 7h1v1h-1zM14 8h1v1h-1zM16 8h1v1h-1zM18 8h1v1h-1zM13 9h1v1h-1zM15 9h1v1h-1zM17 9h2v1h-2zM12 10h1v1h-1zM14 10h1v1h-1zM16 10h3v1h-3zM11 11h1v1h-1zM13 11h1v1h-1zM15 11h4v1h-4zM8 12h1v1h-1zM10 12h1v1h-1zM12 12h1v1h-1zM14 12h3v1h-3zM18 12h1v1h-1zM9 13h1v1h-1zM11 13h1v1h-1zM13 13h3v1h-3zM17 13h1v1h-1zM10 14h5v1h-5zM16 14h1v1h-1zM10 15h4v1h-4zM15 15h1v1h-1zM12 16h1v1h-1zM14 16h2v1h-2z",
  },
  {
    tone: "light",
    d: "M14 4h2v1h-2zM12 5h3v1h-3zM16 5h1v1h-1zM13 6h3v1h-3zM17 6h1v1h-1zM12 7h3v1h-3zM16 7h1v1h-1zM18 7h1v1h-1zM11 8h3v1h-3zM15 8h1v1h-1zM17 8h1v1h-1zM8 9h1v1h-1zM10 9h3v1h-3zM14 9h1v1h-1zM16 9h1v1h-1zM8 10h4v1h-4zM13 10h1v1h-1zM15 10h1v1h-1zM7 11h4v1h-4zM12 11h1v1h-1zM14 11h1v1h-1zM7 12h1v1h-1zM9 12h1v1h-1zM11 12h1v1h-1zM13 12h1v1h-1zM8 13h1v1h-1zM10 13h1v1h-1zM12 13h1v1h-1zM9 14h1v1h-1z",
  },
  { tone: "pale", d: "M11 4h3v1h-3zM10 5h2v1h-2zM9 6h4v1h-4zM8 7h4v1h-4zM7 8h4v1h-4zM7 9h1v1h-1zM9 9h1v1h-1zM7 10h1v1h-1z" },
  { tone: "spark", d: "M12.08 9.08h.5v.48h-.5z" },
  { tone: "glint", d: "M14.12 9.12h.5v.5h-.5z" },
];

/** The clip for the sheen. Only the landing header draws it, once per page, so the id is fixed. */
const RING_CLIP_ID = "logo-ring-clip";

/**
 * The travelling highlight: bands drawn face on, turned by logo.css, then
 * tilted onto the ring's ellipse and clipped to the ring's own cells. The
 * ring itself never moves; only the light on it does.
 */
function RingSheen() {
  return (
    <>
      <clipPath id={RING_CLIP_ID}>
        <path d={RING} />
      </clipPath>
      <g clipPath={`url(#${RING_CLIP_ID})`}>
        <g transform={RING_TILT}>
          <g data-logo-ring-sheen="" className="logo-ring-sheen">
            {SHEEN_BANDS.map(({ tone, from, to }) => (
              <path key={`${tone}-${String(from)}`} d={sheenWedge(from, to)} style={{ fill: `var(--mark-${tone})` }} />
            ))}
          </g>
        </g>
      </g>
    </>
  );
}

/**
 * The artifacts.space mark, a 27 by 20 pixel-art grid with fixed brand colors
 * (the `--mark-*` tokens). It is the same in light and dark mode and renders
 * at one CSS pixel per grid unit so every edge lands on whole device pixels.
 * With `spin`, a highlight travels around the still ring as the page scrolls,
 * so the ring seems to spin in place (see logo.css); otherwise, and with
 * reduced motion, the mark is still.
 */
function LogoMark({ spin }: { spin: boolean }) {
  return (
    <svg
      viewBox="0 0 27 20"
      width={27}
      height={20}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
      className="h-5 w-[27px] shrink-0"
    >
      <g data-logo-ring="">
        <path d={RING} style={{ fill: "var(--mark-base)" }} />
        {spin && <RingSheen />}
        <path d={RING_SPARKS} style={{ fill: "var(--mark-spark)" }} />
      </g>
      {PLANET.map(({ tone, d }) => (
        <path key={tone} d={d} style={{ fill: `var(--mark-${tone})` }} />
      ))}
    </svg>
  );
}

/**
 * The site logo: the mark plus the wordmark, linking home. `compact` drops the
 * wordmark. `spin` sends a highlight around the ring with the page scroll;
 * only the landing page's header sets it.
 */
export function Logo({
  href = "/",
  compact = false,
  spin = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  spin?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="artifacts.space home">
      <LogoMark spin={spin} />
      {!compact && <span className="text-md font-medium tracking-[-0.01em]">artifacts.space</span>}
    </Link>
  );
}
