"use client";

import { IconExternalLink, IconLoader2, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { withdrawSharingAction } from "@/app/(workspace)/app/sharing-actions";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import type { ArtifactDto } from "@/lib/artifact-types";
import { canManageTeam } from "@/lib/teams/roles";

import { visibilityLabel } from "./share-options";
import { useShareTeams } from "./share-teams-context";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

interface SharedArtifactPanelProps {
  artifact: ArtifactDto;
  onWithdrawn: (id: string) => void;
}

/**
 * Read-only view of an artifact someone else shared with the viewer's team.
 * Owners and admins of that team can make it private again.
 */
export function SharedArtifactPanel({ artifact, onWithdrawn }: SharedArtifactPanelProps) {
  const teams = useShareTeams();
  const [withdrawing, setWithdrawing] = useState(false);
  const team = teams.find((item) => item.id === artifact.teamId);
  const canWithdraw = team ? canManageTeam(team.role) : false;

  async function withdraw() {
    setWithdrawing(true);
    try {
      const result = await withdrawSharingAction(artifact.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Sharing withdrawn. Only the author can read it now.");
      onWithdrawn(artifact.id);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={artifact.title}>
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 sm:px-5">
        <span className="text-xs text-muted-foreground">
          {visibilityLabel(artifact.visibility)}{team ? ` · ${team.name}` : ""} · Read only{artifact.pendingEdit ? " · Changes waiting for approval" : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton value={artifact.content} variant="ghost" size="icon" />
          <Button variant="ghost" size="sm" className="text-xs" nativeButton={false} render={<Link href={`/artifact/${artifact.publicId}`} />}>
            <IconExternalLink /> Open page
          </Button>
          {canWithdraw ? (
            <Button variant="outline" size="sm" className="text-xs" disabled={withdrawing} onClick={() => void withdraw()}>
              {withdrawing ? <IconLoader2 className="animate-spin" /> : <IconLock />} Withdraw sharing
            </Button>
          ) : null}
        </div>
      </div>
      <div className="border-b px-5 py-5 sm:px-7">
        <h2 className="text-2xl font-medium tracking-[-0.015em]">{artifact.title}</h2>
        {artifact.summary ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{artifact.summary}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">Updated {dateFormat.format(new Date(artifact.updatedAt))}</p>
      </div>
      <div className="min-h-[460px] flex-1 bg-card p-6 sm:p-8">
        <ArtifactView kind={artifact.kind} content={artifact.content} title={artifact.title} language={artifact.language} />
      </div>
    </section>
  );
}
