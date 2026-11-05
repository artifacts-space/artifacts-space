import { Check, FileText, Braces, Bot } from "lucide-react";

import { Logo } from "@/components/logo";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="blueprint-grid relative hidden overflow-hidden border-r border-white/10 bg-[#0d0e11] p-12 lg:flex lg:flex-col">
        <Logo />
        <div className="my-auto max-w-lg">
          <div className="mb-6 font-mono text-[10px] tracking-[0.16em] text-[#72a5ff]">THE WORK BETWEEN THE PROMPTS</div>
          <h2 className="text-balance text-5xl font-medium leading-[1.05] tracking-[-0.055em]">
            Every session<br />starts with context.
          </h2>
          <div className="mt-12 overflow-hidden rounded-lg border border-white/10 bg-[#111216]/90 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="font-mono text-[9px] text-white/35">SESSION HANDOFF</span>
              <span className="flex items-center gap-1.5 font-mono text-[8px] text-[#72a5ff]"><Check className="size-3" /> SYNCED</span>
            </div>
            <div className="space-y-3 p-4">
              {[
                { icon: FileText, title: "Architecture decision", agent: "Claude Code" },
                { icon: Braces, title: "API response schema", agent: "Cursor" },
                { icon: Bot, title: "Implementation plan", agent: "OpenCode" },
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.025] p-3">
                  <item.icon className="size-3.5 text-[#72a5ff]" />
                  <div>
                    <p className="text-[11px] text-white/65">{item.title}</p>
                    <p className="mt-1 font-mono text-[8px] text-white/25">via {item.agent}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="font-mono text-[9px] text-white/20">ARTIFACTS.SPACE / SHARED CONTEXT INFRASTRUCTURE</p>
      </aside>
      <main className="relative flex min-h-screen flex-col px-6 py-7 sm:px-10">
        <Logo className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-12">{children}</div>
      </main>
    </div>
  );
}
