import type { ReactNode } from "react";

import { AskChat, CollabPreview, InstallTerminal } from "./how-visuals";
import { PixelIcon } from "./pixel-icon";
import { SectionEyebrow } from "./section-marks";
import "./how.css";

interface Step {
  title: string;
  body: string;
  visual: ReactNode;
}

const steps: readonly Step[] = [
  { title: "Add the skill", body: "One command. Your agent learns to save its artifacts here, not inside one account.", visual: <InstallTerminal /> },
  { title: "Ask the way you always do", body: "Ask for a plan or a review. It works like the artifacts built into your AI tools.", visual: <AskChat /> },
  { title: "Edit, share, and work together", body: "People and agents across your team edit, comment on, and share the same page.", visual: <CollabPreview /> },
];

/**
 * How it works, as one horizontal pipeline: a hairline runs through three
 * chapters, and an artifact travels along it as you scroll (how.css). Each
 * chapter shows its step: install, ask, collaborate. On narrow screens the
 * chapters stack and the line is hidden.
 */
export function HowSection() {
  return (
    <section id="how" className="how-pipeline scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="how-heading">
      <SectionEyebrow>how it works</SectionEyebrow>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <h2 id="how-heading" className="max-w-[560px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
          Use it like the artifacts you already know.
        </h2>
        <p className="max-w-[560px] text-base leading-7 text-muted-foreground">
          The artifacts.space skill tells your agent to save its artifacts here. You work the same way you do now. The difference: you, your team, and every agent can edit, share, and comment on each artifact.
        </p>
      </div>
      <ol className="relative mt-14 grid gap-14 xl:grid-cols-3 xl:grid-rows-[repeat(4,auto)] xl:gap-x-6 xl:gap-y-0">
        <span aria-hidden className="absolute inset-x-0 top-[18px] hidden h-px bg-border xl:block" />
        <span aria-hidden className="how-token absolute top-[18px] hidden -translate-y-1/2 bg-background px-1 xl:block">
          <PixelIcon name="plan" size={32} />
        </span>
        {steps.map((step, index) => (
          <li key={step.title} className="flex min-w-0 flex-col xl:row-span-4 xl:grid xl:grid-rows-subgrid">
            <span className="relative z-10 w-fit bg-background pr-4 font-mono text-4xl leading-none tracking-[-0.04em]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-8 text-lg font-medium">{step.title}</h3>
            <p className="mt-2 max-w-[420px] text-md leading-6 text-muted-foreground">{step.body}</p>
            <div className="mt-6 min-w-0">{step.visual}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
