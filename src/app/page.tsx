import Image from "next/image";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { ArtifactDemo } from "@/components/landing/artifact-demo";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { mcpConfigJson, TOKEN_PLACEHOLDER } from "@/lib/setup/mcp-config";

const mcpConfig = mcpConfigJson("https://artifacts.space");

const steps = [
  {
    title: "Connect",
    body: "Create an access token in the workspace and add one MCP server to Claude Code, Cursor, OpenCode, or any other MCP client.",
  },
  {
    title: "Capture",
    body: "Agents save decisions, plans, code, and research as artifacts while they work. Each one has a title, a format, and a project.",
  },
  {
    title: "Share",
    body: "Open any artifact in the workspace, edit it, and share it by link. The next session, agent, or teammate reads the same record.",
  },
];

const tools = [
  ["artifacts_create", "Create an artifact with a title, format, project, and content."],
  ["artifacts_get", "Return one artifact in full."],
  ["artifacts_list", "List and search artifacts by text or project."],
  ["artifacts_update", "Change an artifact in place. Its id and share link do not change."],
  ["artifacts_delete", "Remove an artifact."],
];

const facts = [
  ["Agent agnostic", "One standard MCP endpoint. No dependency on a single model, lab, or editor."],
  ["Your database", "Artifacts live in Postgres you control. Run it on Neon or self-host it."],
  ["Private by default", "Every artifact is scoped to its owner. Sharing is explicit and revocable."],
  ["Open source", "The hub is open source. Read it, run it, and change it."],
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-6 text-[13px] text-muted-foreground" aria-label="Main navigation">
          <a href="#how" className="hidden transition-colors hover:text-foreground sm:inline">How it works</a>
          <a href="#tools" className="hidden transition-colors hover:text-foreground sm:inline">Tools</a>
          <Link href="/sign-in" className="transition-colors hover:text-foreground">Sign in</Link>
          <Button render={<Link href="/sign-up" />} nativeButton={false} size="sm" className="hidden px-3 sm:inline-flex">
            Get started
          </Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-6">
        <section className="pb-14 pt-20 sm:pb-16 sm:pt-28">
          <h1 className="animate-enter max-w-[920px] text-balance text-[clamp(2.5rem,5.5vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.035em]">
            A shared artifact hub for coding agents.
          </h1>
          <p className="animate-enter mt-6 max-w-[640px] text-[17px] leading-7 text-muted-foreground" style={{ animationDelay: "60ms" }}>
            artifacts.space is an open-source place to keep the work an agent produces: decisions, plans, code, and research. Any MCP client can create, read, and update the same artifacts, and people can share them across a team.
          </p>
          <div className="animate-enter mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "120ms" }}>
            <Button render={<Link href="/sign-up" />} nativeButton={false} className="h-10 px-4 text-sm">
              Get started <IconArrowRight data-icon="inline-end" />
            </Button>
            <CopyButton value={mcpConfig} label="Copy MCP config" variant="outline" className="h-10 px-4 text-sm" />
          </div>
          <p className="animate-enter mt-5 text-[13px] text-muted-foreground" style={{ animationDelay: "160ms" }}>
            Works with Claude Code, Cursor, OpenCode, and any MCP client.
          </p>
        </section>

        <section className="animate-enter pb-24" style={{ animationDelay: "220ms" }} aria-label="Workspace preview">
          <div className="relative isolate overflow-hidden rounded-xl bg-hero-backdrop px-4 py-10 sm:px-10 sm:py-20 lg:py-28">
            <Image
              src="/hero-dusk.webp"
              alt=""
              fill
              priority
              sizes="(min-width: 1440px) 1392px, 100vw"
              className="-z-10 object-cover"
            />
            <div aria-hidden="true" className="hero-tone pointer-events-none absolute inset-0 -z-10" />
            <div aria-hidden="true" className="hero-grain pointer-events-none absolute inset-0 -z-10" />
            <div className="mx-auto max-w-[1080px]">
              <ArtifactDemo />
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 border-t py-20">
          <h2 className="text-3xl font-medium tracking-[-0.025em] sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title}>
                <div className="font-mono text-xs text-muted-foreground">{index + 1}</div>
                <h3 className="mt-3 text-[15px] font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="tools" className="scroll-mt-20 border-t py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-medium tracking-[-0.025em] sm:text-4xl">Five tools, one endpoint</h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                Add the server once. Every call is scoped to the authenticated user, so an agent only sees the artifacts it is allowed to see.
              </p>
              <table className="mt-8 w-full border-collapse text-sm">
                <tbody>
                  {tools.map(([name, description]) => (
                    <tr key={name} className="border-t last:border-b">
                      <td className="py-3 pr-6 align-top font-mono text-[13px] whitespace-nowrap">{name}</td>
                      <td className="py-3 align-top leading-6 text-muted-foreground">{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <CodeBlock title="mcp.json" value={mcpConfig} className="bg-card" preClassName="p-5" />
              <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                Replace <code className="font-mono">{TOKEN_PLACEHOLDER}</code> with an access token from Connections. Tokens are shown once and stored as hashes.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t py-20" aria-label="Principles">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map(([title, body]) => (
              <div key={title}>
                <h3 className="text-[15px] font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 py-8 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <div className="flex items-center gap-5">
            <Link href="/sign-in" className="transition-colors hover:text-foreground">Sign in</Link>
            <Link href="/sign-up" className="transition-colors hover:text-foreground">Create account</Link>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
