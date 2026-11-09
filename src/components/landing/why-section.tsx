import Image from "next/image";

import type { PixelIconName } from "@/lib/landing/pixel-icons";

import { ClaudeCodeMark, CodexMark } from "./agent-marks";
import { PixelIcon } from "./pixel-icon";
import { SectionEyebrow } from "./section-marks";

const problem = [
  "Artifacts usually live inside the account that made them. Move from one Claude Code account to another, or from Claude to Codex, and you and your team lose the shared surface. Agents on the other account cannot open or update the artifacts you made.",
  "You end up with a dozen tabs open, and you copy text between tools. We hit this ourselves, so we built artifacts.space.",
] as const;

/** Each account keeps its own artifacts; the dashed edges are the walls between them. */
const islands = [
  { app: "claude-code", account: "Claude Code · work", artifact: "auth-plan" },
  { app: "claude-code", account: "Claude Code · personal", artifact: "q3-review" },
  { app: "codex", account: "Codex", artifact: "launch-notes" },
] as const;

/** One walled-off account: its app mark and name, and the one artifact only it can open. */
function Island({ island }: { island: (typeof islands)[number] }) {
  const Mark = island.app === "codex" ? CodexMark : ClaudeCodeMark;
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-[2px] border border-dashed bg-background px-3 py-3">
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Mark className="size-4 shrink-0 text-foreground" />
        <span className="truncate">{island.account}</span>
      </span>
      <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-[2px] border bg-card px-1.5 py-0.5 font-mono text-xs">
        <PixelIcon name="plan" size={16} />
        <span className="truncate">{island.artifact}</span>
      </span>
    </li>
  );
}

interface Answer {
  icon: PixelIconName;
  title: string;
  body: string;
}

const answers: readonly Answer[] = [
  { icon: "swap", title: "Switch accounts. Lose nothing.", body: "Change your Claude or Codex subscription at any time. Your agents still open and edit every artifact, because it lives here and not in one account." },
  { icon: "agents", title: "Every agent sees the same artifacts.", body: "Start a plan in Claude Code. Edit it in Codex, Cursor, OpenCode, or fx. You copy nothing between tools." },
  { icon: "team", title: "Your team sees them too.", body: "Share an artifact with your team. They read it and comment on it. Their agents open and edit it from any tool." },
];

/** The problem as a flat, quiet panel: the story, then the accounts that cannot see each other. */
function ProblemPanel() {
  return (
    <div className="flex min-w-0 flex-col rounded-[2px] border border-dashed bg-muted p-6 sm:p-8">
      <h3 className="text-lg font-medium">Today</h3>
      {problem.map((paragraph) => (
        <p key={paragraph} className="mt-4 text-md leading-6 text-muted-foreground">
          {paragraph}
        </p>
      ))}
      <div className="mt-auto pt-8">
        <ul aria-label="Three accounts, each with its own artifact" className="grid gap-2 sm:grid-cols-3">
          {islands.map((island) => <Island key={island.account} island={island} />)}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">Each account keeps its own artifacts. None can open the others.</p>
      </div>
    </div>
  );
}

/** The answer as a raised card: the brand mark, then each answer beside its pixel icon. */
function AnswerCard() {
  return (
    <div className="frame-sharp relative min-w-0 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <Image src="/artifacts-space-mark.svg" alt="" width={54} height={40} className="h-10 w-[54px] shrink-0" />
        <h3 className="text-lg font-medium">One place for every artifact</h3>
      </div>
      <div className="mt-6 grid">
        {answers.map((answer) => (
          <div key={answer.title} className="flex gap-4 border-t py-5 last:pb-0">
            <PixelIcon name={answer.icon} size={32} />
            <div className="min-w-0">
              <h4 className="text-base font-medium">{answer.title}</h4>
              <p className="mt-1.5 max-w-[520px] text-md leading-6 text-muted-foreground">{answer.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The catch: switching accounts cuts people and agents off from their artifacts. Then the answer: one place for every artifact. */
export function WhySection() {
  return (
    <section id="why" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="why-heading">
      <SectionEyebrow>the catch</SectionEyebrow>
      <h2 id="why-heading" className="max-w-[640px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
        But switching accounts cuts you off.
      </h2>
      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <ProblemPanel />
        <AnswerCard />
      </div>
    </section>
  );
}
