"use client";

import { useMemo, useState } from "react";

import type { ShareActions } from "@/components/app/share-control";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { ArtifactHeader } from "@/components/artifact-page/artifact-header";
import { ArtifactHeaderMenu } from "@/components/artifact-page/artifact-header-menu";
import { ArtifactPageShare } from "@/components/artifact-page/page-share";
import { ArtifactPageTheme } from "@/components/artifact-page/artifact-page-theme";
import { PageEditorChromeProvider } from "@/components/artifact-page/page-editor-chrome";
import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { CommentComposer } from "@/components/comments/comment-composer";
import { MentionablesLoader, MentionablesProvider, type LoadMentionables } from "@/components/comments/mentionables-context";
import { commentSettings, type ArtifactDto } from "@/lib/artifact-types";
import type { MentionDirectory } from "@/lib/comments/mention-autocomplete";
import { pageColumnClass } from "@/lib/page-width/rules";
import { presetTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import { decideSharing } from "@/lib/sharing/rules";
import { defaultActor, defaultRoleCapabilities } from "@/lib/teams/capability-rules";
import { visibilityCopy, visibilitySentence } from "@/lib/visibility-copy";

import { fixtureArtifact } from "./fixture-content";
import { steeredNetwork } from "./fixture-mentions-network";

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

const fixtureSelf = { userId: "fixture-dev", handle: "dev", name: "Dev", kind: "person" as const };

/**
 * Who a comment can mention on the fixture artifact, as the server answers
 * it: nobody while it is private (nobody else can read it), and the team's
 * people once it is shared through a team.
 */
function mentionablesFor(artifact: ArtifactDto): MentionDirectory {
  if (artifact.visibility === "private") return { candidates: [], self: fixtureSelf };
  return {
    candidates: [
      { userId: "fixture-dana", handle: "dana", name: "Dana Reyes", kind: "person" },
      { userId: "fixture-leah", handle: "leah", name: "Leah Park", kind: "person" },
    ],
    self: fixtureSelf,
  };
}

/**
 * The in-memory actions over their own copy of the artifact, starting from
 * `initial`, and the list of people to mention read from that copy. The
 * loader is one function for the page's life, as the server action is: the
 * comment box gets a new list only when it asks again. Its requests go
 * through a network the test can hold or fail (FIXTURE_MENTIONS_NETWORK);
 * the list is read when a request answers.
 */
function memoryShareStore(initial: ArtifactDto): { actions: ShareActions; mentionables: LoadMentionables } {
  let current = initial;
  return {
    actions: memoryShareActions(() => current, (next) => { current = next; }),
    mentionables: steeredNetwork(() => mentionablesFor(current)),
  };
}

/** A comment box under the fixture's title, with the mention list the real thread has. Posting keeps nothing. */
function FixtureCommentBox({ publicId, load }: { publicId: string; load: LoadMentionables }) {
  return (
    <MentionablesLoader load={load}>
      <MentionablesProvider publicId={publicId}>
        <section aria-label="Comments" className="mt-12 border-t pt-8">
          <CommentComposer label="Write a comment" placeholder="Write a comment" submitLabel="Comment" onSubmit={() => Promise.resolve({ ok: true, mentions: null })} />
        </section>
      </MentionablesProvider>
    </MentionablesLoader>
  );
}

/** The sentence the header shows for the fixture artifact's level now. */
function sentenceFor(artifact: ArtifactDto) {
  const team = fixtureTeams.find((item) => item.id === artifact.teamId);
  return visibilitySentence(visibilityCopy(artifact.visibility), { author: "Dev", teamName: team?.name ?? null });
}

/** A Download CSV link that goes nowhere, for the widest header. */
const widestDownload = { href: "#download", filename: "launch-checklist.csv" };

/** The page header around the artifact's title, as the artifact page lays it out. */
function FixturePage({ artifact, share, theme = null, comments = null }: { artifact: ArtifactDto; share: React.ReactNode; theme?: Theme | null; comments?: React.ReactNode }) {
  const column = pageColumnClass(false);
  return (
    <ArtifactPageTheme theme={theme} overlays className="min-h-screen" data-page-theme={theme ? "set" : "site"}>
      <PageEditorChromeProvider>
        <StickyChrome>
          {/* The owner gets the widest header there is (a CSV editor's: Download CSV too), so the phone-width check covers it. */}
          <ArtifactHeader column={column} visibility={artifact.visibility} sentence={sentenceFor(artifact)} content={artifact.content} share={share} menu={share ? <ArtifactHeaderMenu /> : null} download={share ? widestDownload : null} />
        </StickyChrome>
      </PageEditorChromeProvider>
      <main className={`mx-auto w-full py-12 sm:py-16 ${column}`}>
        <h1 className="text-3xl font-semibold tracking-tight">{artifact.title}</h1>
        <p className="mt-4 text-md text-muted-foreground" data-fixture-sharing="">
          {artifact.visibility}:{artifact.teamId ?? "none"}
        </p>
        {comments}
      </main>
    </ArtifactPageTheme>
  );
}

/**
 * Development only: the artifact page's header for its owner (Share in place
 * of the visibility status, saving in memory) or for a reader (the
 * read-only status), with no database. The artifact page share e2e test
 * uses it. `mentions` adds a comment box whose list of people to mention
 * follows the fixture's sharing, as the page's thread does.
 */
export function ArtifactShareFixture({ as, themeId = null, mentions = false }: { as: "owner" | "reader"; themeId?: string | null; mentions?: boolean }) {
  // `?theme=<preset id>`: the page wears that theme, as a themed artifact's page does (overlays included).
  const theme = themeId ? (presetTheme(themeId) ?? null) : null;
  const initial = useMemo(() => fixtureArtifact({ id: "fixture-share", kind: "markdown", title: "Launch checklist", content: "# Launch checklist" }), []);
  const [artifact, setArtifact] = useState(initial);
  const [store] = useState(() => memoryShareStore(initial));
  if (as === "reader") return <FixturePage artifact={{ ...artifact, visibility: "team", teamId: "fixture-platform" }} share={null} theme={theme} />;
  const share = <ArtifactPageShare artifact={artifact} teams={fixtureTeams} sentence={sentenceFor(artifact)} shareUrl={`https://artifacts.space/artifact/${artifact.publicId}`} actions={store.actions} onSaved={setArtifact} />;
  const comments = mentions ? <FixtureCommentBox publicId={artifact.publicId} load={store.mentionables} /> : null;
  return <FixturePage artifact={artifact} share={share} theme={theme} comments={comments} />;
}
