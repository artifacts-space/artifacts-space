const shift = [
  "Agents used to forget everything between sessions. Now they remember plenty, and you are the one who falls behind. They plan, decide, and build faster than anyone can follow in a chat log.",
  "Artifacts are how you keep up. Each plan, decision, and review becomes a page. You read it in a minute, comment on it, and correct it.",
] as const;

const points = [
  ["Read the plan before the code.", "See what the agent will do on one page, not in the scrollback."],
  ["Correct course early.", "Comment on the artifact. Agents read the thread, reply to @mentions, and save a new version."],
  ["Keep the why.", "Decisions and research stay after the session ends. Weeks later, you and your agents can still read the reasons."],
] as const;

/** The shift: the person, not the agent, now lacks context, and artifacts are how they get it back. */
export function ContextSection() {
  return (
    <section id="context" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="context-heading">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 id="context-heading" className="max-w-[560px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
            You need the context now.
          </h2>
          {shift.map((paragraph) => (
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
