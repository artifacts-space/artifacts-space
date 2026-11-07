import type { ReactNode } from "react";

import { rolloutContent, rolloutSession as s } from "@/lib/landing/rollout-session";

/** How Claude Code prints a long string argument: quoted, escaped, and cut short. */
const contentPreview = `${JSON.stringify(rolloutContent).slice(0, 34)}…"`;
const artifactUrl = `https://artifacts.space/artifact/${s.artifactId}`;

type Arg = [key: string, value: string];

function Args({ args }: { args: Arg[] }) {
  return (
    <>
      (
      {args.map(([key, value], index) => (
        <span key={key}>
          {index > 0 ? ", " : null}
          {key}: {value.startsWith("\"") ? value : JSON.stringify(value)}
        </span>
      ))}
      )
    </>
  );
}

function Prompt({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-sm bg-muted px-2.5 py-1.5 text-foreground">
      <span aria-hidden="true" className="select-none text-muted-foreground">&gt; </span>
      {children}
    </p>
  );
}

/** One MCP call the way Claude Code shows it: server, tool, compact args, then the result. */
function Call({ tool, args = [], result }: { tool: string; args?: Arg[]; result: ReactNode }) {
  return (
    <div>
      <p>
        <span aria-hidden="true" className="text-tone-success">⏺ </span>
        <span className="font-medium text-foreground">artifacts - {tool}</span>
        <span className="text-muted-foreground"> (MCP)</span>
        {args.length > 0 ? <Args args={args} /> : null}
      </p>
      <p className="flex gap-[1ch] pl-[2ch] text-muted-foreground">
        <span aria-hidden="true" className="select-none">⎿</span>
        <span className="min-w-0">{result}</span>
      </p>
    </div>
  );
}

function Reply({ children }: { children: ReactNode }) {
  return (
    <p className="text-foreground">
      <span aria-hidden="true" className="text-foreground">⏺ </span>
      {children}
    </p>
  );
}

/**
 * A static mockup of a Claude Code session that saves a ui artifact, asks for
 * a review, then reads the review and updates the plan. Tool names and
 * argument shapes match the MCP server in src/lib/mcp.
 */
export function SessionTerminal() {
  return (
    <figure aria-label="A Claude Code session that uses the artifacts.space MCP server" className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex h-10 items-center gap-3 border-b px-4 text-xs text-muted-foreground">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="font-medium text-foreground">Claude Code</span>
        <span className="truncate font-mono">~/{s.team}/{s.project}</span>
      </div>
      <div className="terminal-reveal flex flex-col gap-4 p-4 font-mono text-sm leading-6 text-muted-foreground wrap-anywhere sm:p-5">
        <Prompt>{s.firstPrompt}</Prompt>
        <Call
          tool="artifacts_create"
          args={[["title", s.title], ["kind", "ui"], ["project", s.project], ["visibility", "team"], ["team", s.team], ["content", contentPreview]]}
          result={<>&quot;url&quot;: &quot;{artifactUrl}&quot;, &quot;visibility&quot;: &quot;team&quot;, &quot;sharing&quot;: {"{"} &quot;status&quot;: &quot;applied&quot; {"}"}</>}
        />
        <Call
          tool="comment_create"
          args={[["artifact", s.artifactId], ["body", s.askForReview]]}
          result={<>&quot;mentions&quot;: {"{"} &quot;notified&quot;: [{"{"} &quot;handle&quot;: &quot;{s.reviewerHandle}&quot;, &quot;kind&quot;: &quot;person&quot; {"}"}], &quot;refused&quot;: [] {"}"}</>}
        />
        <Reply>Saved and shared with {s.team}. Dana has a review request.</Reply>
        <Prompt>{s.secondPrompt}</Prompt>
        <Call
          tool="inbox_list"
          result={<>&quot;author&quot;: {"{"} &quot;handle&quot;: &quot;{s.reviewerHandle}&quot; {"}"}, &quot;body&quot;: {"{"} &quot;untrustedText&quot;: &quot;{s.reviewComment}&quot; {"}"}</>}
        />
        <Call tool="artifacts_update" args={[["id", s.artifactId], ["content", contentPreview]]} result={<>&quot;edit&quot;: &quot;applied&quot;</>} />
        <Call
          tool="comment_create"
          args={[["artifact", s.artifactId], ["replyTo", s.reviewCommentId], ["body", s.agentReply]]}
          result={<>&quot;comment&quot;: {"{"} &quot;replyTo&quot;: &quot;{s.reviewCommentId}&quot; {"}"}</>}
        />
        <Reply>{s.agentSummary}</Reply>
      </div>
    </figure>
  );
}
