"use client";

import Link from "next/link";
import { useState, type RefObject } from "react";
import { toast } from "sonner";

import { dismissTeamWelcomeAction } from "@/app/(workspace)/app/welcome-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ActionResult } from "@/lib/artifact-types";
import { teamWelcome } from "@/lib/teams/team-rule-copy";

import { settle } from "./projects-api";
import type { ShareTeam } from "./share-teams-context";

/** Saves that the member closed the welcome in one team: the server action, or the fixture's stand-in. */
export type DismissWelcome = (teamId: string) => Promise<ActionResult<null>>;

/** The server action behind "Got it". */
export const serverDismissWelcome: DismissWelcome = (teamId) => dismissTeamWelcomeAction(teamId);

/**
 * Whether the card shows, and the one-click close. It closes at once and
 * moves focus to `focusAfter`, so keyboard and screen reader users keep
 * their place; when the save fails, it comes back with the error, so the
 * member knows it would show again next time.
 */
function useTeamWelcome(initial: boolean, teamId: string, save: DismissWelcome, focusAfter: RefObject<HTMLElement | null>) {
  const [shown, setShown] = useState(initial);
  async function dismiss() {
    setShown(false);
    focusAfter.current?.focus();
    const result = await settle(save(teamId), "Could not close the welcome. Try again.");
    if (result.success) return;
    setShown(true);
    toast.error(result.error);
  }
  return { shown, dismiss: () => void dismiss() };
}

/** 44px tall on phones, the usual control height from sm up. */
const actionSize = "h-11 px-4 sm:h-8 sm:px-3";

/** The card: what the member can do in the team first, then the rule for sharing outside it, then the actions. */
function TeamWelcomeCard({ team, onDismiss }: { team: ShareTeam; onDismiss: () => void }) {
  const welcome = teamWelcome(team.name, team);
  return (
    <section aria-labelledby="team-welcome-title" data-slot="team-welcome" className="card-surface px-5 py-4">
      <h2 id="team-welcome-title" className="text-md font-medium">{welcome.title}</h2>
      <p className="mt-1 max-w-prose text-sm leading-5 text-muted-foreground">{welcome.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className={actionSize} onClick={onDismiss}>Got it</Button>
        {/* A real link, not a button, so it reads as one and middle-click works: the team page's "How this team works" card. */}
        <Link href={`/teams/${team.slug}`} className={buttonVariants({ variant: "ghost", className: actionSize })}>How this team works</Link>
      </div>
    </section>
  );
}

interface TeamWelcomeProps {
  /** The team workspace on screen, or null for the viewer's own artifacts. */
  team: ShareTeam | null;
  /** The server's decision for this member and team (welcome-rules.ts); left out, no card. */
  initial: boolean | undefined;
  /** Left out, the server action saves the close. */
  dismiss: DismissWelcome | undefined;
  /** Where focus goes when the card closes: the workspace's heading. */
  focusAfter: RefObject<HTMLElement | null>;
}

/**
 * The welcome for a new member, above the team's workspace. It stays until
 * they close it, and the close is saved for them in this team on every
 * device. The server decides who sees it (src/lib/teams/welcome-rules.ts).
 */
export function TeamWelcome({ team, initial = false, dismiss = serverDismissWelcome, focusAfter }: TeamWelcomeProps) {
  const welcome = useTeamWelcome(initial, team?.id ?? "", dismiss, focusAfter);
  if (!team || !welcome.shown) return null;
  return (
    <div className="border-b bg-background p-3 sm:px-4">
      <TeamWelcomeCard team={team} onDismiss={welcome.dismiss} />
    </div>
  );
}
