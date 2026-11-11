"use client";

import { IconClock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { ShareControl, type ShareActions, type ShareTriggerProps } from "@/components/app/share-control";
import { ShareTeamsProvider, type ShareTeam } from "@/components/app/share-teams-context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ArtifactDto, ShareableArtifactDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";
import { visibilityCopy } from "@/lib/visibility-copy";

import { visibilityIcons, visibilityStatusClass } from "./visibility-badge";

interface ShareStatusButtonProps extends ShareTriggerProps {
  /** The full visibility sentence ("Private. Only you can see this."), for the tooltip. */
  sentence: string;
  /** The page is catching up after a save. */
  busy: boolean;
}

/** The button's visible label and accessible name: the level, or "Pending" while a change waits, as the workspace's Share button says. */
export function shareStatusText(visibility: ShareTriggerProps["visibility"], waiting: boolean) {
  const label = waiting ? "Pending" : visibilityCopy(visibility).label;
  return { label, name: `${label}. Share settings` };
}

/**
 * The header's visibility status as the sharer's Share button: the same icon
 * and label as the read-only status ("Private"), or a clock and "Pending"
 * while a change waits for approval, with an edge so it reads as a control.
 * On phones it is the icon alone, 44px square on touch screens.
 */
function ShareStatusButton({ visibility, waiting, onOpen, sentence, busy }: ShareStatusButtonProps) {
  const Icon = waiting ? IconClock : visibilityIcons[visibility];
  const { label, name } = shareStatusText(visibility, waiting);
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" onClick={onOpen} />}
        aria-label={name}
        aria-haspopup="dialog"
        aria-busy={busy}
        data-visibility={visibility}
        data-pending={waiting}
        className={cn(visibilityStatusClass, "border border-border text-foreground max-sm:justify-center pointer-coarse:h-11 max-sm:pointer-coarse:w-11")}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="max-sm:sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{waiting ? `Waiting for approval. Until then: ${sentence}` : `${sentence} Change who can see it.`}</TooltipContent>
    </Tooltip>
  );
}

interface ArtifactPageShareProps {
  artifact: ShareableArtifactDto;
  teams: readonly ShareTeam[];
  /** The header's visibility sentence for the level now. */
  sentence: string;
  shareUrl: string;
  /** After a save; the page refreshes from the server when left out. The /dev fixture keeps the change in memory instead. */
  onSaved?: (artifact: ArtifactDto) => void;
  /** Where saves go: the workspace's server actions unless the /dev fixture hands its own. */
  actions?: ShareActions;
}

/**
 * Share on the artifact's own page, for the people who share it in the
 * workspace (canShareArtifact): the workspace's Share dialog (ShareControl)
 * behind the header's visibility status. After a save the page refreshes
 * from the server, so the header, the editor's approval state, and
 * everything else that depends on who can read it catch up.
 */
export function ArtifactPageShare({ artifact, teams, sentence, shareUrl, onSaved, actions }: ArtifactPageShareProps) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refresh = useCallback(() => { startRefresh(() => { router.refresh(); }); }, [router]);
  const renderTrigger = useCallback((trigger: ShareTriggerProps) => <ShareStatusButton {...trigger} sentence={sentence} busy={refreshing} />, [sentence, refreshing]);
  return (
    <ShareTeamsProvider teams={teams}>
      <ShareControl artifact={artifact} shareUrl={shareUrl} onUpdated={onSaved ?? refresh} renderTrigger={renderTrigger} {...(actions ? { actions } : {})} />
    </ShareTeamsProvider>
  );
}
