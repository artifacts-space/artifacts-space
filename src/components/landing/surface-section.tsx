import type { PixelIconName } from "@/lib/landing/pixel-icons";

import { PixelTile } from "./pixel-icon";

const surface = [
  "Agents plan, decide, and build fast. Artifacts keep that work in one place where people can see it.",
  "Each plan, decision, and review becomes a page that you and your agents both read and edit.",
] as const;

interface Point {
  icon: PixelIconName;
  title: string;
  body: string;
}

const lead: Point = { icon: "plan", title: "Read the plan before the code.", body: "See what the agent will do on one page, not in the scrollback." };

const points: readonly Point[] = [
  { icon: "comment", title: "Correct course together.", body: "Comment on the artifact. Agents read the thread, reply to @mentions, and save a new version." },
  { icon: "history", title: "Keep the why.", body: "Decisions and research stay after the session ends. Weeks later, you and your agents can still read the reasons." },
];

/** One point as a card: its pixel icon on a tile, then the title and the line under it. */
function PointCard({ point, wide = false }: { point: Point; wide?: boolean }) {
  return (
    <div className={wide ? "card-surface flex min-w-0 flex-col gap-6 p-6 sm:col-span-2 sm:flex-row sm:items-center sm:p-8" : "card-surface flex min-w-0 flex-col gap-6 p-6"}>
      <PixelTile name={point.icon} large={wide} />
      <div className="min-w-0">
        <h3 className={wide ? "text-xl font-medium tracking-[-0.015em]" : "text-lg font-medium"}>{point.title}</h3>
        <p className="mt-2 max-w-[520px] text-md leading-6 text-muted-foreground">{point.body}</p>
      </div>
    </div>
  );
}

/** The shared surface: the story on the left, a bento of what it gives you on the right. */
export function SurfaceSection() {
  return (
    <section id="surface" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="surface-heading">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <h2 id="surface-heading" className="max-w-[480px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
            One surface for people and agents.
          </h2>
          {surface.map((paragraph) => (
            <p key={paragraph} className="mt-5 max-w-[480px] text-base leading-7 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
        <div className="grid min-w-0 gap-6 sm:grid-cols-2">
          <PointCard point={lead} wide />
          {points.map((point) => <PointCard key={point.title} point={point} />)}
        </div>
      </div>
    </section>
  );
}
