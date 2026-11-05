import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Braces,
  Database,
  Globe2,
  Layers3,
  LockKeyhole,
  RefreshCw,
  Terminal,
} from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { ArtifactDemo } from "@/components/landing/artifact-demo";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const mcpConfig = `{
  "mcpServers": {
    "artifacts": {
      "url": "https://artifacts.space/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`;

const capabilities = [
  {
    number: "01",
    icon: Layers3,
    title: "Keep the useful parts",
    description:
      "Save decisions, research, plans, code, and outputs as structured artifacts—not another transcript to excavate.",
    detail: "MARKDOWN · CODE · TEXT · JSON",
  },
  {
    number: "02",
    icon: RefreshCw,
    title: "Pick up where you left off",
    description:
      "Retrieve the same context from a new session, a different repository, or another agent. No copy-paste relay race.",
    detail: "SEARCH · FILTER · UPDATE",
  },
  {
    number: "03",
    icon: Globe2,
    title: "Move between any harness",
    description:
      "One standard MCP endpoint works across labs, models, and coding tools. Your context is yours, not your client's.",
    detail: "CLAUDE CODE · CURSOR · OPENCODE",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(ellipse_at_50%_-10%,rgba(31,103,255,0.09),transparent_58%)]" />

      <header className="relative z-10 mx-auto flex h-20 w-full max-w-[1200px] items-center justify-between border-b border-white/10 px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden font-mono text-[10px] text-white/30 sm:inline">/ shared context</span>
        </div>
        <nav className="flex items-center gap-6 text-[13px] text-white/55" aria-label="Main navigation">
          <a href="#why" className="hidden transition-colors hover:text-white sm:inline">Why artifacts</a>
          <a href="#connect" className="hidden transition-colors hover:text-white sm:inline">Connect</a>
          <Link href="/sign-in" className="transition-colors hover:text-white">Sign in</Link>
          <Button render={<Link href="/sign-up" />} className="hidden h-8 bg-white px-3 text-black hover:bg-white/85 sm:inline-flex">
            Get started <ArrowUpRight />
          </Button>
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-[1200px] px-6">
        <section className="pb-16 pt-16 sm:pb-20 sm:pt-20">
          <div className="animate-enter" style={{ animationDelay: "50ms" }}>
            <div className="mb-7 flex items-center gap-3 font-mono text-[10px] tracking-[0.16em] text-[#72a5ff]">
              <span className="h-px w-8 bg-[#3980ff]/60" />
              AGENT-NATIVE CONTEXT INFRASTRUCTURE
            </div>
            <h1 className="max-w-[980px] text-balance text-[clamp(2.85rem,7vw,5.4rem)] font-semibold leading-[0.99] tracking-[-0.065em] text-[#f5f5f3]">
              Context that outlives<br className="max-sm:hidden" /> the session.
            </h1>
          </div>

          <div className="mt-8 grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <p className="animate-enter max-w-[680px] text-balance text-[17px] leading-8 text-white/50 sm:text-[19px]" style={{ animationDelay: "130ms" }}>
              Create, retrieve, and share the work your agents produce. One MCP memory layer for every coding session, across any lab or harness.
            </p>
            <div className="animate-enter flex items-center gap-2 font-mono text-[10px] text-white/30" style={{ animationDelay: "180ms" }}>
              <span className="size-1.5 animate-signal rounded-full bg-[#4d8dff]" />
              OPEN PROTOCOL · YOUR POSTGRES
            </div>
          </div>

          <div className="animate-enter mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "220ms" }}>
            <Button render={<Link href="/sign-up" />} className="h-11 gap-2 rounded-lg bg-[#ecece9] px-4 font-mono text-[12px] font-normal text-[#17181b] hover:bg-white">
              Start building <ArrowRight />
            </Button>
            <CopyButton
              value={mcpConfig}
              label="Copy MCP config"
              variant="secondary"
              className="h-11 rounded-lg px-4 font-mono text-[12px]"
            />
            <a href="#why" className="ml-1 inline-flex h-11 items-center gap-2 px-2 text-[13px] text-white/50 transition-colors hover:text-white">
              How it works <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </section>

        <section className="animate-enter pb-24" style={{ animationDelay: "300ms" }} aria-label="Artifact workspace preview">
          <div className="relative">
            <div className="absolute -inset-8 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(34,107,255,0.08),transparent_65%)] blur-2xl" />
            <ArtifactDemo />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[9px] tracking-[0.12em] text-white/25">
            <span>BUILT FOR THE WORK BETWEEN THE PROMPTS</span>
            <span>01 / ARTIFACT WORKBENCH</span>
          </div>
        </section>

        <section id="why" className="scroll-mt-16 border-t border-white/10 py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.5fr]">
            <div>
              <div className="mb-5 font-mono text-[10px] tracking-[0.16em] text-[#72a5ff]">WHY ARTIFACTS</div>
              <h2 className="max-w-md text-balance text-4xl font-medium leading-[1.08] tracking-[-0.045em] sm:text-5xl">
                Your agent forgets.<br />Your work shouldn&apos;t.
              </h2>
              <p className="mt-6 max-w-sm text-[15px] leading-7 text-white/45">
                Sessions end. Models change. The useful context should still be there when you come back.
              </p>
            </div>
            <div className="border-t border-white/10">
              {capabilities.map((capability) => (
                <article key={capability.number} className="group grid gap-4 border-b border-white/10 py-7 sm:grid-cols-[40px_1fr] sm:py-8">
                  <div className="flex items-center justify-between sm:block">
                    <span className="font-mono text-[10px] text-white/25">/{capability.number}</span>
                    <capability.icon className="size-4 text-[#72a5ff] sm:mt-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-medium tracking-[-0.025em] text-white/90">{capability.title}</h3>
                    <p className="mt-2.5 max-w-xl text-[14px] leading-6 text-white/45">{capability.description}</p>
                    <p className="mt-4 font-mono text-[9px] tracking-[0.12em] text-white/25 transition-colors group-hover:text-[#72a5ff]/70">
                      {capability.detail}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="connect" className="scroll-mt-16 border-t border-white/10 py-20 sm:py-28">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#101115]">
            <div className="grid lg:grid-cols-2">
              <div className="p-7 sm:p-10 lg:p-12">
                <div className="mb-8 flex size-10 items-center justify-center rounded-lg border border-[#3980ff]/20 bg-[#1768ff]/10">
                  <Terminal className="size-4 text-[#72a5ff]" />
                </div>
                <div className="font-mono text-[10px] tracking-[0.16em] text-[#72a5ff]">FIVE TOOLS. ANY AGENT.</div>
                <h2 className="mt-5 text-balance text-4xl font-medium tracking-[-0.045em]">Connect once.<br />Remember everywhere.</h2>
                <p className="mt-5 max-w-md text-[14px] leading-7 text-white/45">
                  Add the server, create an access token, and let your agent capture the context worth keeping.
                </p>
                <div className="mt-8 flex flex-wrap gap-2 font-mono text-[9px] text-white/45">
                  {["create", "get", "list", "update", "delete"].map((tool) => (
                    <span key={tool} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">artifacts_{tool}</span>
                  ))}
                </div>
                <Button render={<Link href="/sign-up" />} className="mt-9 h-10 bg-white px-4 text-black hover:bg-white/85">
                  Get your MCP token <ArrowRight />
                </Button>
              </div>
              <div className="blueprint-grid border-t border-white/10 p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
                <div className="flex h-full min-h-[350px] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0c0d10] shadow-2xl">
                  <div className="flex h-10 items-center justify-between border-b border-white/10 px-4">
                    <span className="font-mono text-[10px] text-white/45">mcp.json</span>
                    <Braces className="size-3.5 text-white/25" />
                  </div>
                  <pre className="flex-1 overflow-auto p-5 font-mono text-[11px] leading-6 text-white/55 sm:p-6">
                    <code>{mcpConfig}</code>
                  </pre>
                  <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
                    <span className="font-mono text-[9px] text-white/25">STREAMABLE HTTP</span>
                    <CopyButton value={mcpConfig} label="Copy config" variant="ghost" className="h-7 text-[10px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid border-t border-white/10 sm:grid-cols-3">
          {[
            { icon: Bot, title: "Agent agnostic", text: "No lab lock-in. No harness lock-in." },
            { icon: Database, title: "Postgres native", text: "Durable, queryable context on Neon." },
            { icon: LockKeyhole, title: "Private by default", text: "Scoped tokens. Explicit sharing." },
          ].map((item) => (
            <div key={item.title} className="flex gap-4 border-b border-white/10 py-8 sm:border-b-0 sm:pr-6 sm:[&:not(:last-child)]:border-r sm:[&:not(:first-child)]:pl-8">
              <item.icon className="mt-0.5 size-4 shrink-0 text-[#72a5ff]" />
              <div>
                <h3 className="text-[13px] font-medium text-white/80">{item.title}</h3>
                <p className="mt-1.5 text-[12px] leading-5 text-white/35">{item.text}</p>
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 border-t border-white/10 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-3 font-mono text-[9px] tracking-[0.1em] text-white/25">THE WORK BETWEEN THE PROMPTS.</p>
        </div>
        <div className="flex items-center gap-5 text-[12px] text-white/40">
          <Link href="/sign-in" className="hover:text-white">Sign in</Link>
          <a href="#connect" className="hover:text-white">MCP setup</a>
          <span className="font-mono text-[9px] text-white/20">© 2026</span>
        </div>
      </footer>
    </div>
  );
}
