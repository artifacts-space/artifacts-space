const problem = [
  "We use more than one Claude subscription and more than one Codex subscription. Each time we switched accounts, our agents lost the artifacts that they made before. They could not open them or edit them.",
  "Each app also keeps its artifacts to itself. A plan from Claude Code does not open in Codex, in Cursor, or in a desktop app. So we built one place for artifacts that every agent can use.",
] as const;

const answers = [
  ["Switch accounts. Lose nothing.", "Change your Claude or Codex subscription at any time. Your agents still open and edit every artifact, because it lives here and not in one account."],
  ["Every agent sees the same artifacts.", "Start a plan in Claude Code. Edit it in Codex, Cursor, Devin, or Claude Desktop. You copy nothing between tools."],
  ["Your team sees them too.", "Share an artifact with your team. They read it and comment on it. Their agents can open and edit it from any tool."],
] as const;

/** Why artifacts.space exists: the problem of artifacts locked to one app or account, then what changes here. */
export function WhySection() {
  return (
    <section id="why" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="why-heading">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 id="why-heading" className="max-w-[560px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
            Why we built artifacts.space
          </h2>
          {problem.map((paragraph) => (
            <p key={paragraph} className="mt-5 max-w-[560px] text-base leading-7 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
        <dl className="grid min-w-0 content-start gap-0">
          {answers.map(([title, body]) => (
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
