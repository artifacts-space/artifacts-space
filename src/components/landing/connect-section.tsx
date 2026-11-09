import Link from "next/link";

import { docsHref } from "@/lib/docs/pages";
import { toolRows } from "@/lib/mcp/tool-summaries";
import { SKILL_INSTALL_STATUS } from "@/lib/setup/install-command";

const tools = toolRows();
const readCount = tools.filter((tool) => tool.access === "read").length;

const baseWays = [
  ["Approve it in your browser", "Add one server to Claude Code, Cursor, OpenCode, fx, or another MCP client. Sign in and approve the connection. There is no token to paste."],
  ["Run it in CI", "Headless agents and Mogplex send an API token instead. You see the token once. The server keeps only a hash."],
] as const;

const skillWay = ["Teach it when to save", "Add the artifacts.space skill. Your agent learns when to save, update, and share its work."] as const;

const ways = SKILL_INSTALL_STATUS === "published" ? [...baseWays, skillWay] : baseWays;

/** How agents connect, in words only, next to every MCP tool the server registers. */
export function ConnectSection() {
  return (
    <section id="connect" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="connect-heading">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 id="connect-heading" className="max-w-[560px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
            Connect once. Your agent gets {tools.length} tools.
          </h2>
          <dl className="mt-10 grid gap-0">
            {ways.map(([title, body]) => (
              <div key={title} className="border-t py-5">
                <dt className="text-base font-medium">{title}</dt>
                <dd className="mt-1.5 max-w-[520px] text-md leading-6 text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
          <Link href={docsHref("quickstart")} className="mt-2 inline-block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">
            Connect your agent in the quickstart
          </Link>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-medium">Every tool</h3>
          <p className="mt-1.5 text-md leading-6 text-muted-foreground">
            A read-only connection gets the {readCount} read tools and nothing else.
          </p>
          <ul className="mt-5 gap-8 border-t pt-4 font-mono text-sm leading-7 sm:columns-2">
            {tools.map((tool) => (
              <li key={tool.name} title={tool.summary} className="flex items-baseline justify-between gap-3 break-inside-avoid">
                <span className="min-w-0 truncate">{tool.name}</span>
                <span className="shrink-0 font-sans text-xs text-muted-foreground">{tool.access}</span>
              </li>
            ))}
          </ul>
          <Link href={docsHref("mcp")} className="mt-5 inline-block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">
            Read the MCP reference
          </Link>
        </div>
      </div>
    </section>
  );
}
