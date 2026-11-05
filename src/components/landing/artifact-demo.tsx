"use client";

import {
  Bot,
  Braces,
  Check,
  ChevronDown,
  Circle,
  FileCode2,
  FileText,
  Folder,
  MoreHorizontal,
  Search,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const examples = [
  {
    id: "auth",
    title: "Auth architecture decision",
    project: "artifacts-space",
    kind: "markdown",
    icon: FileText,
    updated: "2m",
    content: `# Auth architecture decision

## Decision
Use Better Auth with Neon-backed sessions. Agents authenticate with scoped, revocable bearer tokens.

## Why
• Web sessions and MCP access share one identity
• Token hashes are never readable after creation
• Every artifact remains scoped to its owner

## Next
Add token rotation before the public beta.`,
  },
  {
    id: "schema",
    title: "artifact.schema.ts",
    project: "artifacts-space",
    kind: "code",
    icon: FileCode2,
    updated: "18m",
    content: `export const artifact = pgTable("artifact", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  project: text("project"),
  sessionId: text("session_id"),
  source: text("source"),
  updatedAt: timestamp("updated_at"),
});`,
  },
  {
    id: "research",
    title: "MCP client compatibility",
    project: "protocol-research",
    kind: "json",
    icon: Braces,
    updated: "1h",
    content: `{
  "transport": "streamable-http",
  "clients": ["Claude Code", "Cursor", "OpenCode"],
  "capabilities": {
    "create": true,
    "search": true,
    "update": true
  }
}`,
  },
];

export function ArtifactDemo() {
  const [selectedId, setSelectedId] = useState(examples[0].id);
  const selected = examples.find((example) => example.id === selectedId) ?? examples[0];

  return (
    <div className="overflow-hidden rounded-xl border border-white/15 bg-[#101115] shadow-[0_35px_100px_-35px_rgba(0,0,0,0.9),0_0_0_6px_rgba(255,255,255,0.018)]">
      <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
          </div>
          <span className="font-mono text-[11px] text-white/45">workspace / artifacts</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-white/40">
          <span className="size-1.5 animate-signal rounded-full bg-[#4d8dff]" />
          MCP CONNECTED
        </div>
      </div>

      <div className="grid min-h-[440px] grid-cols-[210px_minmax(0,1fr)] max-md:grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_210px]">
        <aside className="border-r border-white/10 bg-white/[0.015] max-md:border-r-0 max-md:border-b">
          <div className="p-3">
            <div className="flex h-8 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2.5 text-white/35">
              <Search className="size-3.5" />
              <span className="font-mono text-[10px]">Search artifacts…</span>
              <kbd className="ml-auto text-[9px]">⌘K</kbd>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-4 pb-2 text-[11px] text-white/45">
            <ChevronDown className="size-3" />
            <Folder className="size-3.5" />
            All artifacts
            <span className="ml-auto font-mono text-[9px]">24</span>
          </div>
          <div className="space-y-1 px-2 pb-3 max-md:grid max-md:grid-cols-3 max-md:gap-1 max-md:space-y-0">
            {examples.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => setSelectedId(example.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-colors",
                  selectedId === example.id
                    ? "bg-[#1768ff]/15 text-white ring-1 ring-[#3980ff]/25"
                    : "text-white/55 hover:bg-white/[0.04] hover:text-white/80",
                )}
              >
                <example.icon className={cn("mt-0.5 size-3.5 shrink-0", selectedId === example.id && "text-[#72a5ff]")} />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium">{example.title}</span>
                  <span className="mt-1 block truncate font-mono text-[9px] text-white/30">
                    {example.project} · {example.updated}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0">
          <div className="flex h-12 items-center justify-between border-b border-white/10 px-5">
            <div className="flex items-center gap-2 text-[11px] text-white/65">
              <selected.icon className="size-3.5 text-[#72a5ff]" />
              {selected.title}
            </div>
            <MoreHorizontal className="size-4 text-white/35" />
          </div>
          <div className="p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-2 font-mono text-[9px] tracking-[0.14em] text-[#72a5ff]">
              <span className="rounded-sm bg-[#1768ff]/10 px-1.5 py-1 ring-1 ring-[#3980ff]/20">
                {selected.kind.toUpperCase()}
              </span>
              <span className="text-white/25">ARTIFACT_{selected.id.toUpperCase()}</span>
            </div>
            <pre className="max-w-[62ch] font-mono text-[11px] leading-[1.9] whitespace-pre-wrap text-white/60 max-sm:text-[10px]">
              {selected.content}
            </pre>
          </div>
        </main>

        <aside className="border-l border-white/10 bg-white/[0.015] p-4 max-lg:hidden">
          <div className="mb-5 flex items-center gap-2 text-[10px] font-medium text-white/45">
            <Sparkles className="size-3.5 text-[#72a5ff]" />
            SESSION CONTEXT
          </div>
          <div className="space-y-4">
            {[
              ["Claude Code", "Created artifact", "09:41"],
              ["Cursor", "Added decision", "09:43"],
              ["OpenCode", "Retrieved context", "09:44"],
            ].map(([agent, action, time], index) => (
              <div key={agent} className="relative flex gap-2.5">
                {index < 2 && <span className="absolute top-5 left-[5px] h-8 w-px bg-white/10" />}
                {index === 2 ? (
                  <Circle className="mt-1 size-[11px] shrink-0 fill-[#1768ff] text-[#1768ff]" />
                ) : (
                  <Check className="mt-0.5 size-3 shrink-0 text-[#72a5ff]" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/70">
                    <Bot className="size-3 text-white/35" /> {agent}
                  </div>
                  <p className="mt-1 text-[10px] text-white/35">{action}</p>
                  <p className="mt-1 font-mono text-[8px] text-white/20">{time}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-md border border-[#3980ff]/15 bg-[#1768ff]/[0.06] p-3">
            <p className="font-mono text-[9px] leading-5 text-white/40">
              One source of truth.<br />Three agents.<br />Zero repeated context.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
