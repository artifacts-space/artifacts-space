const problem = [
  "Artifacts usually live inside the account that made them. Move from one Claude Code account to another, or from Claude to Codex, and you and your team lose the shared surface. Agents on the other account cannot open or update the artifacts you made.",
  "You end up with a dozen tabs open, and you copy text between tools. We hit this ourselves, so we built artifacts.space.",
] as const;

const answers = [
  ["Switch accounts. Lose nothing.", "Change your Claude or Codex subscription at any time. Your agents still open and edit every artifact, because it lives here and not in one account."],
  ["Every agent sees the same artifacts.", "Start a plan in Claude Code. Edit it in Codex, Cursor, or OpenCode. You copy nothing between tools."],
  ["Your team sees them too.", "Share an artifact with your team. They read it and comment on it. Their agents open and edit it from any tool."],
] as const;

/** The catch: switching accounts cuts people and agents off from their artifacts. Then the answer: one place for every artifact. */
export function WhySection() {
  return (
    <section id="why" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="why-heading">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 id="why-heading" className="max-w-[560px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
            But switching accounts cuts you off.
          </h2>
          {problem.map((paragraph) => (
            <p key={paragraph} className="mt-5 max-w-[560px] text-base leading-7 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-medium">One place for every artifact</h3>
          <dl className="mt-4 grid content-start gap-0">
            {answers.map(([title, body]) => (
              <div key={title} className="border-t py-5">
                <dt className="text-base font-medium">{title}</dt>
                <dd className="mt-1.5 max-w-[520px] text-md leading-6 text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
