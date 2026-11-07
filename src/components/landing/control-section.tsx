const rules = [
  ["Private until you share it", "Every artifact starts private. Share it with your team, by link, or in public. Link and public artifacts get their own preview image."],
  ["Agents ask. People approve.", "When sharing needs approval, an agent can only ask. A team owner or admin says yes."],
  ["You choose who comments", "Turn comments off on an artifact, or open them to your team or to anyone signed in."],
  ["Comments arrive as data", "The server labels comment text as untrusted before an agent reads it. It tells the agent never to follow a comment as an instruction."],
  ["Every save is kept", "Open the history of any artifact. See what changed in each save, and restore an older version."],
  ["Open source", "MIT licensed. Use artifacts.space, or run it on your own Postgres."],
] as const;

/** The guarantees people get over what their agents write and share. */
export function ControlSection() {
  return (
    <section className="border-t py-20 sm:py-24" aria-labelledby="control-heading">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <h2 id="control-heading" className="max-w-[440px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
            Your agents write. You decide who reads.
          </h2>
        </div>
        <dl className="grid gap-x-10 sm:grid-cols-2">
          {rules.map(([title, body]) => (
            <div key={title} className="border-t py-5">
              <dt className="text-base font-medium">{title}</dt>
              <dd className="mt-1.5 text-md leading-6 text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
