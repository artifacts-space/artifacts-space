import Image from "next/image";
import { replayCycleMs, T } from "@/lib/landing/demo-story";

import { DemoBrowser } from "./demo-browser";
import { DemoHandoff } from "./demo-handoff";
import { DemoReplay } from "./demo-replay";
import { DemoTerminal } from "./demo-terminal";
import "./demo.css";
import "./demo-replay.css";

const description =
  "Two windows on a desktop: Claude Code and the artifacts.space app in a browser. You ask Claude Code to save a checkout rollout plan and to ask Dana to check the risks. " +
  "The agent creates the artifact. It lands in your list and opens as a page with a chart, a timeline, and a board of risks. " +
  "The agent shares it with the Acme team and mentions Dana in a comment. Dana replies: hold at 5% over the weekend. " +
  "The agent reads her reply and saves version 2 of the plan with the hold.";

/** When focus moves between the windows; demo-replay.css reads these. */
const focusTimes: Record<string, number> = { "--focus-app": T.appFront, "--focus-term": T.termFront, "--focus-app2": T.appFront2 };

/**
 * The hero demo: one agent session, start to finish, in two overlapping
 * windows on the dusk backdrop. The desktop is a picture of the product, so
 * it is inert and hidden from screen readers; the caption says in words
 * what it shows.
 */
export function HeroDemo() {
  return (
    <section id="demo" className="animate-enter scroll-mt-20 pb-24 max-sm:-mx-6" style={{ animationDelay: "220ms" }} aria-label="Product demo">
      <figure className="relative isolate overflow-hidden bg-hero-backdrop px-4 py-4 sm:rounded-xl sm:p-8 xl:p-10">
        <Image src="/hero-dusk.webp" alt="" fill priority sizes="(min-width: 1440px) 1392px, 100vw" className="-z-10 object-cover" />
        <div aria-hidden="true" className="hero-tone pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden="true" className="hero-grain pointer-events-none absolute inset-0 -z-10" />
        <figcaption className="sr-only">{description}</figcaption>
        <DemoReplay cycleMs={replayCycleMs()} className="demo-board">
          <div className="demo-desk" style={focusTimes} aria-hidden="true" inert>
            <div className="demo-win demo-win--term">
              <div className="demo-win__frame"><DemoTerminal /></div>
            </div>
            <div className="demo-win demo-win--app">
              <div className="demo-win__frame"><DemoBrowser /></div>
            </div>
            <DemoHandoff />
          </div>
        </DemoReplay>
      </figure>
    </section>
  );
}
