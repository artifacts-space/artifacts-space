import Image from "next/image";

import { replayCycleMs } from "@/lib/landing/demo-story";

import { DemoApp } from "./demo-app";
import { DemoReplay } from "./demo-replay";
import { DemoTerminal } from "./demo-terminal";
import "./demo.css";

const description =
  "A Claude Code session beside the artifacts.space app. You ask Claude Code to save a checkout rollout plan and to ask Dana to check the risks. " +
  "The agent creates the artifact. It lands in your list and opens as a page with a chart, a timeline, and a board of risks. " +
  "The agent shares it with the Acme team and mentions Dana in a comment. Dana replies: hold at 5% over the weekend. " +
  "The agent reads her reply and saves version 2 of the plan with the hold.";

/**
 * The hero demo: one agent session, start to finish, on the dusk backdrop.
 * The board is a picture of the product, so it is inert and hidden from
 * screen readers; the caption says in words what it shows.
 */
export function HeroDemo() {
  return (
    <section id="how" className="animate-enter scroll-mt-20 pb-24 max-sm:-mx-6" style={{ animationDelay: "220ms" }} aria-label="How it works">
      <figure className="relative isolate overflow-hidden bg-hero-backdrop p-3 sm:rounded-xl sm:p-8 lg:p-10">
        <Image src="/hero-dusk.webp" alt="" fill priority sizes="(min-width: 1440px) 1392px, 100vw" className="-z-10 object-cover" />
        <div aria-hidden="true" className="hero-tone pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden="true" className="hero-grain pointer-events-none absolute inset-0 -z-10" />
        <figcaption className="sr-only">{description}</figcaption>
        <DemoReplay cycleMs={replayCycleMs()} className="demo-board">
          <div className="demo-board__frame" aria-hidden="true" inert>
            <DemoTerminal />
            <DemoApp />
          </div>
        </DemoReplay>
      </figure>
    </section>
  );
}
