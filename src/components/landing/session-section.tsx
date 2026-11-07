import Link from "next/link";

import { docsHref } from "@/lib/docs/pages";
import { uiComponentNames } from "@/lib/ui/catalog";

import { SessionResult } from "./session-result";
import { SessionTerminal } from "./session-terminal";

/** How it works, shown rather than told: one agent session and the artifact it made. */
export function SessionSection() {
  return (
    <section id="how" className="scroll-mt-20 border-t py-20 sm:py-24">
      <h2 className="max-w-[760px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
        Ask in your terminal. Review it on a real page.
      </h2>
      <p className="mt-4 max-w-[640px] text-base leading-7 text-muted-foreground">
        Your agent saves the plan and asks Dana to review it. Dana leaves a comment. The agent reads it, updates the plan, and replies in the thread. Every save is a version you can restore.
      </p>
      <div className="mt-12 grid items-start gap-4 lg:grid-cols-2">
        <SessionTerminal />
        <SessionResult />
      </div>
      <p className="mt-6 max-w-[640px] text-md leading-6 text-muted-foreground">
        The agent sent JSON. The app drew this page from {uiComponentNames.length} components that every agent can use, such as charts, tables, boards, and calendars.{" "}
        <Link href={docsHref("json-render/components")} className="underline underline-offset-4 transition-colors hover:text-foreground">See the components</Link>
      </p>
    </section>
  );
}
