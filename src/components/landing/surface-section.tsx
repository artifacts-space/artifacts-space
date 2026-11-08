import { SectionEyebrow } from "./section-marks";
import { SurfaceMock, type SurfaceRegion } from "./surface-mock";
import "./surface.css";


interface Callout {
  region: SurfaceRegion;
  title: string;
  body: string;
}

const callouts: readonly Callout[] = [
  { region: "plan", title: "Read the plan before the code.", body: "See what the agent will do on one page, not in the scrollback." },
  { region: "comments", title: "Correct course together.", body: "Comment on the artifact. Agents read the thread, reply to @mentions, and save a new version." },
  { region: "history", title: "Keep the why.", body: "Decisions and research stay after the session ends. Weeks later, you and your agents can still read the reasons." },
];

/**
 * The shared surface as one large artifact to explore: a realistic window on
 * a dot grid, with the three benefits pinned to its parts. Hovering a callout
 * highlights its part of the window, and the other way round (surface.css).
 */
export function SurfaceSection() {
  return (
    <section id="surface" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="surface-heading">
      <SectionEyebrow>why it matters</SectionEyebrow>
      <div>
        <h2 id="surface-heading" className="max-w-[640px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
          One surface for people and agents.
        </h2>
        <p className="mt-5 max-w-[640px] text-base leading-7 text-muted-foreground">
          Agents plan, decide, and build fast. Artifacts keep that work in one place where people can see it. Each plan, decision, and review becomes a page that you and your agents both read and edit.
        </p>
      </div>
      <div className="surface-explore mt-12 grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-center">
        <div className="dot-grid relative border border-dashed p-3 sm:p-8 lg:p-12">
          <SurfaceMock />
        </div>
        <ol className="grid gap-0 sm:grid-cols-3 sm:gap-6 xl:grid-cols-1 xl:gap-0">
          {callouts.map((callout, index) => (
            <li key={callout.region} data-callout={callout.region} className="surface-callout border-t py-5">
              <span className="surface-callout-number grid size-6 place-items-center rounded-[2px] border font-mono text-xs text-muted-foreground">{index + 1}</span>
              <h3 className="mt-3 text-base font-medium">{callout.title}</h3>
              <p className="mt-1.5 text-md leading-6 text-muted-foreground">{callout.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
