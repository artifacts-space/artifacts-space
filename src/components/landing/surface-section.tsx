const surface = [
  "Agents plan, decide, and build fast. Artifacts keep that work in one place where people can see it.",
  "Each plan, decision, and review becomes a page that you and your agents both read and edit.",
] as const;

const points = [
  ["Read the plan before the code.", "See what the agent will do on one page, not in the scrollback."],
  ["Correct course together.", "Comment on the artifact. Agents read the thread, reply to @mentions, and save a new version."],
  ["Keep the why.", "Decisions and research stay after the session ends. Weeks later, you and your agents can still read the reasons."],
] as const;

/** The shared surface: artifacts keep agents' work in one place that people and agents both read and edit. */
export function SurfaceSection() {
  return (
    <section id="surface" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="surface-heading">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 id="surface-heading" className="max-w-[560px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
            One surface for people and agents.
          </h2>
          {surface.map((paragraph) => (
            <p key={paragraph} className="mt-5 max-w-[560px] text-base leading-7 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
        <dl className="grid min-w-0 content-start gap-0">
          {points.map(([title, body]) => (
            <div key={title} className="border-t py-5">
              <dt className="text-base font-medium">{title}</dt>
              <dd className="mt-1.5 max-w-[520px] text-md leading-6 text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
