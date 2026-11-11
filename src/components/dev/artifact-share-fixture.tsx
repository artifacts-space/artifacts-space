"use client";

import { useMemo, useState } from "react";

import type { ShareActions } from "@/components/app/share-control";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { ArtifactHeader } from "@/components/artifact-page/artifact-header";
import { ArtifactHeaderMenu } from "@/components/artifact-page/artifact-header-menu";
import { ArtifactPageShare } from "@/components/artifact-page/page-share";
import { PageEditorChromeProvider } from "@/components/artifact-page/page-editor-chrome";
import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { commentSettings, type ArtifactDto } from "@/lib/artifact-types";
import { pageColumnClass } from "@/lib/page-width/rules";
import { decideSharing } from "@/lib/sharing/rules";
import { defaultActor, defaultRoleCapabilities } from "@/lib/teams/capability-rules";
import { visibilityCopy, visibilitySentence } from "@/lib/visibility-copy";

import { fixtureArtifact } from "./fixture-content";

/** The viewer's teams: their personal team, Platform (sharing applies at once), and Design (team sharing waits for approval). */
const fixtureTeams: ShareTeam[] = [
  { id: "fixture-personal", slug: "fixture-personal", name: "Dev", personal: true, role: "owner", roleKey: "owner", kind: "person", capabilities: [...defaultRoleCapabilities.owner], teamSharingNeedsApproval: false },
  { id: "fixture-platform", slug: "fixture-platform", name: "Platform", personal: false, role: "member", roleKey: "member", kind: "person", capabilities: [...defaultRoleCapabilities.member], teamSharingNeedsApproval: false },
  { id: "fixture-design", slug: "fixture-design", name: "Design", personal: false, role: "member", roleKey: "member", kind: "person", capabilities: [...defaultRoleCapabilities.member], teamSharingNeedsApproval: true },
];

const requestedAt = "2026-11-11T12:00:00.000Z";

/**
 * Sharing kept in memory, decided by the real sharing rule (decideSharing)
 * for each fixture team: applies at once, or waits as a request. Nothing
 * reaches a server.
 */
function memoryShareActions(read: () => ArtifactDto, write: (artifact: ArtifactDto) => void): ShareActions {
  const keep = (artifact: ArtifactDto) => { write(artifact); return artifact; };
  return {
    share: (_id, input) => {
      const current = read();
      const team = fixtureTeams.find((item) => item.id === input.teamId);
      const comments = input.comments ?? current.comments;
      if (input.visibility === "private" || !team) {
        return Promise.resolve({ success: true, data: { status: "applied", comments: "applied", artifact: keep({ ...current, visibility: "private", teamId: null, comments, pendingSharing: null }) } });
      }
      const outcome = decideSharing({ level: input.visibility, team, member: defaultActor("member"), actor: "person" });
      if (outcome === "pending") {
        const pendingSharing = { requestId: "fixture-request", level: input.visibility, teamId: team.id, comments, requestedAt };
        return Promise.resolve({ success: true, data: { status: "pending", comments: "pending", artifact: keep({ ...current, pendingSharing }) } });
      }
      return Promise.resolve({ success: true, data: { status: "applied", comments: "applied", artifact: keep({ ...current, visibility: input.visibility, teamId: team.id, comments, pendingSharing: null }) } });
    },
    comments: (_id, comments) => {
      const current = read();
      const setting = commentSettings.find((item) => item === comments) ?? current.comments;
      return Promise.resolve({ success: true, data: { status: "applied", artifact: keep({ ...current, comments: setting }) } });
    },
    search: (_id, on) => Promise.resolve({ success: true, data: keep({ ...read(), showInSearch: on }) }),
  };
}

/** The in-memory actions over their own copy of the artifact, starting from `initial`. */
function memoryShareStore(initial: ArtifactDto): ShareActions {
  let current = initial;
  return memoryShareActions(() => current, (next) => { current = next; });
}

/** The sentence the header shows for the fixture artifact's level now. */
function sentenceFor(artifact: ArtifactDto) {
  const team = fixtureTeams.find((item) => item.id === artifact.teamId);
  return visibilitySentence(visibilityCopy(artifact.visibility), { author: "Dev", teamName: team?.name ?? null });
}

/** The page header around the artifact's title, as the artifact page lays it out. */
function FixturePage({ artifact, share }: { artifact: ArtifactDto; share: React.ReactNode }) {
  const column = pageColumnClass(false);
  return (
    <div className="min-h-screen">
      <PageEditorChromeProvider>
        <StickyChrome>
          <ArtifactHeader column={column} visibility={artifact.visibility} sentence={sentenceFor(artifact)} content={artifact.content} share={share} menu={share ? <ArtifactHeaderMenu /> : null} />
        </StickyChrome>
      </PageEditorChromeProvider>
      <main className={`mx-auto w-full py-12 sm:py-16 ${column}`}>
        <h1 className="text-3xl font-semibold tracking-tight">{artifact.title}</h1>
        <p className="mt-4 text-md text-muted-foreground" data-fixture-sharing="">
          {artifact.visibility}:{artifact.teamId ?? "none"}
        </p>
      </main>
    </div>
  );
}

/**
 * Development only: the artifact page's header for its owner (Share in place
 * of the visibility status, saving in memory) or for a reader (the
 * read-only status), with no database. The artifact page share e2e test
 * uses it.
 */
export function ArtifactShareFixture({ as }: { as: "owner" | "reader" }) {
  const initial = useMemo(() => fixtureArtifact({ id: "fixture-share", kind: "markdown", title: "Launch checklist", content: "# Launch checklist" }), []);
  const [artifact, setArtifact] = useState(initial);
  const [actions] = useState(() => memoryShareStore(initial));
  if (as === "reader") return <FixturePage artifact={{ ...artifact, visibility: "team", teamId: "fixture-platform" }} share={null} />;
  const share = <ArtifactPageShare artifact={artifact} teams={fixtureTeams} sentence={sentenceFor(artifact)} shareUrl={`https://artifacts.space/artifact/${artifact.publicId}`} actions={actions} onSaved={setArtifact} />;
  return <FixturePage artifact={artifact} share={share} />;
}
