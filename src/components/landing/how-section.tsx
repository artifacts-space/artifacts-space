import { CopyButton } from "@/components/copy-button";
import type { PixelIconName } from "@/lib/landing/pixel-icons";
import { SKILL_INSTALL_COMMAND, SKILL_INSTALL_STATUS } from "@/lib/setup/install-command";

import { PixelTile } from "./pixel-icon";

interface Step {
  icon: PixelIconName;
  title: string;
  body: string;
}

const steps: readonly Step[] = [
  {
    icon: "skill",
    title: "Add the skill",
    body: "One command. Your agent learns to save its plans, reports, and reviews as artifacts here, not inside one account.",
  },
  {
    icon: "ask",
    title: "Ask the way you always do",
    body: "Ask for a plan or a review. Your agent saves it as an artifact, the same way the artifacts built into your AI tools work. There is nothing new to learn.",
  },
  {
    icon: "share",
    title: "Edit, share, and work together",
    body: "Edit the page yourself, or share it with your team. People comment, and every agent on the team can read and update it.",
  },
];

/** The command in a flat well, with a copy button. Shown only once the skill is public. */
function InstallCommand() {
  if (SKILL_INSTALL_STATUS !== "published") return null;
  return (
    <div className="card-nested mt-5 flex items-center justify-between gap-2 py-1 pl-3 pr-1">
      <code className="min-w-0 truncate font-mono text-sm">{SKILL_INSTALL_COMMAND}</code>
      <CopyButton value={SKILL_INSTALL_COMMAND} variant="ghost" size="icon-sm" />
    </div>
  );
}

/** How it works: the skill points your agent at artifacts.space; you use it like built-in artifacts, then share and edit across the team. */
export function HowSection() {
  return (
    <section id="how" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="how-heading">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <h2 id="how-heading" className="max-w-[560px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
          Use it like the artifacts you already know.
        </h2>
        <p className="max-w-[560px] text-base leading-7 text-muted-foreground">
          The artifacts.space skill tells your agent to save its artifacts here. You work the same way you do now. The difference: you, your team, and every agent can edit, share, and comment on each artifact.
        </p>
      </div>
      <ol className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="card-surface flex min-w-0 flex-col p-6">
            <div className="flex items-start justify-between gap-4">
              <PixelTile name={step.icon} />
              <span aria-hidden className="font-mono text-sm text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <h3 className="mt-6 text-lg font-medium">{step.title}</h3>
            <p className="mt-2 text-md leading-6 text-muted-foreground">{step.body}</p>
            {index === 0 ? <InstallCommand /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
