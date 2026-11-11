"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { AppHeader } from "@/components/app/app-header";
import { Dashboard } from "@/components/app/dashboard";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { defaultRoleCapabilities } from "@/lib/teams/capability-rules";
import type { ArtifactLink } from "@/lib/app-link";
import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ArtifactDto } from "@/lib/artifact-types";
import { projectFilterId } from "@/lib/projects/filter-params";
import { listLimit } from "@/lib/projects/sidebar-count-rules";
import type { ProjectFilter } from "@/lib/projects/rules";
import { matchesProjectFilter } from "@/lib/projects/sidebar-rules";

import { fixtureArtifact, longCsv, longJson, longMarkdown, longUi } from "./fixture-content";
import { fixtureNewArtifactApi, storedFixtureArtifacts } from "./fixture-new-artifacts";
import { createFixtureProjectsStore, fixtureFacets, LOCKED_TITLE, withProjects } from "./fixture-projects";
import { useFixtureControls } from "./fixture-controls";
import { fixtureFeedbackSend } from "./feedback-fixture";
import { fixtureNotifications, LINK_ONLY_PUBLIC_ID } from "./notification-fixture";

/** The viewer's personal team, so the Share dialog can offer link and public sharing. The switcher does not list it. */
const fixtureTeams: ShareTeam[] = [{ id: "fixture-team", slug: "fixture", name: "Fixture", personal: true, role: "owner", roleKey: "owner", kind: "person", capabilities: [...defaultRoleCapabilities.owner], teamSharingNeedsApproval: false }];

/**
 * Shared teams for `?scopes=1`, with long names for the workspace switcher.
 * Platform engineering has an uploaded icon (a static image standing in for
 * the members-only route); the others show their pixel avatars.
 */
const fixtureSharedTeams: ShareTeam[] = ["Design", "Platform engineering", "Customer research"].map((name, index) => ({
  id: `fixture-shared-${String(index)}`, slug: `fixture-shared-${String(index)}`, name, personal: false, role: "member", roleKey: "member", kind: "person", capabilities: [...defaultRoleCapabilities.member], teamSharingNeedsApproval: false,
  iconUrl: index === 1 ? "/artifacts-space-icon.png" : null,
}));

/** Long csv (in Research), Note 4, and Note 5 carry the tag "launch", for `?tag=launch`. */
const launchTagged: ReadonlySet<string> = new Set(["fixture-csv", "fixture-note-3", "fixture-note-4"]);

/** With `?many=1`, 300 older notes after the rest, so the scope holds more than the list's newest 100. */
function archiveNotes(): ArtifactDto[] {
  return Array.from({ length: 300 }, (_, index) =>
    fixtureArtifact({ id: `fixture-archive-${String(index)}`, kind: "text", title: `Archive note ${String(index + 1)}`, content: "An older note.", publicId: `fixturearchive${String(index).padStart(8, "0")}` }),
  );
}

/** The tag filter's entries over every fixture artifact, as listTagFacets counts them. */
function fixtureTagFacets(artifacts: readonly ArtifactDto[]) {
  const counts = new Map<string, number>();
  for (const tag of artifacts.flatMap((artifact) => artifact.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count }));
}

/** Four long artifacts first, then enough short ones that the list scrolls. Note 2 has comments on; Note 9 has a theme. */
function fixtureArtifacts(many: boolean): ArtifactDto[] {
  const long = [
    fixtureArtifact({ id: "fixture-ui", kind: "ui", title: "Long ui fixture", content: longUi(), publicId: "fixtureworkspace0000ui" }),
    fixtureArtifact({ id: "fixture-markdown", kind: "markdown", title: "Long markdown fixture", content: longMarkdown(), publicId: "fixtureworkspace000md" }),
    fixtureArtifact({ id: "fixture-csv", kind: "csv", title: "Long csv fixture", content: longCsv(), publicId: "fixtureworkspace00csv" }),
    fixtureArtifact({ id: "fixture-json", kind: "json", title: "Long json fixture", content: longJson(), publicId: "fixtureworkspace0json" }),
  ];
  const short = Array.from({ length: 36 }, (_, index) =>
    fixtureArtifact({ id: `fixture-note-${String(index)}`, kind: "text", title: index === 0 ? LOCKED_TITLE : `Note ${String(index + 1)}`, content: `Note ${String(index + 1)}.`, publicId: `fixtureworkspacenote${String(index).padStart(2, "0")}` }),
  );
  // Note 2 keeps comments on for its author, so links can open a thread (e2e/artifact-link.spec.ts).
  // Note 9 uses the Ocean theme, so the preview shows it in its theme (e2e/app-preview-theme.spec.ts).
  // Note 3 was made with Claude Code, so its card and byline show the harness (e2e/agent-harness.spec.ts).
  const all = [...long, ...short.map((note, index): ArtifactDto => {
    if (index === 1) return { ...note, comments: "team" };
    if (index === 2) return { ...note, harness: { id: "claude-code", stamped: "claude-code", overridden: false } };
    if (index === 8) return { ...note, theme: "ocean", kind: "markdown", content: "# Ocean notes\n\nThe preview wears this artifact's theme." };
    return note;
  }), ...(many ? archiveNotes() : [])];
  return all.map((artifact) => (launchTagged.has(artifact.id) ? { ...artifact, tags: ["launch"] } : artifact));
}

const subscribeNever = () => () => undefined;

/** False while rendering on the server and hydrating, true after: what this tab stored is only known in the browser. */
function useInBrowser(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/** Someone else's artifact shared by link: outside the list, so only a link (n6 in the bell) opens it, pinned to the top. */
const linkOnlyArtifact: ArtifactDto = fixtureArtifact({ id: "fixture-link-only", kind: "text", title: "Shared by link fixture", content: "Opened from a link.", publicId: LINK_ONLY_PUBLIC_ID });

/** The artifact `slowLoad` leaves to load on open: the one the bell's comment rows link to. */
const SLOW_ARTIFACT_ID = "fixture-markdown";
const slowPublicIds: ReadonlySet<string> = new Set(["fixtureworkspace000md"]);

/** The fixture's projects in memory, and a stand-in for the project server actions over them. */
function useFixtureProjects(artifacts: readonly ArtifactDto[]) {
  const [store] = useState(() => createFixtureProjectsStore(new Map(artifacts.map((artifact) => [artifact.id, artifact.title]))));
  const state = useSyncExternalStore(store.subscribe, store.read, store.read);
  return { state, api: store.api };
}

/** What /app would list: the project and tag filters, then the newest 100, as listArtifacts does; and the tag filter's entries. */
function useFixtureList(artifacts: readonly ArtifactDto[], projectFilter: ProjectFilter | null, tags: readonly string[]) {
  const items = useMemo(
    () => artifacts.filter((artifact) => matchesProjectFilter(artifact.project, projectFilter) && tags.every((tag) => artifact.tags.includes(tag))).slice(0, listLimit).map(toArtifactListItem),
    [artifacts, projectFilter, tags],
  );
  const tagFacets = useMemo(() => fixtureTagFacets(artifacts), [artifacts]);
  return { items, tagFacets };
}

const noTags: string[] = [];

/** Under `scopes`, Note 6 is the viewer's artifact shared with Design, so its Share dialog states Design's rule (e2e/share-search-engines.spec.ts). */
function withTeamArtifact(artifacts: ArtifactDto[], scopes: boolean): ArtifactDto[] {
  if (!scopes) return artifacts;
  return artifacts.map((artifact) => (artifact.id === "fixture-note-5" ? { ...artifact, visibility: "team", teamId: "fixture-shared-0" } : artifact));
}

/** The welcome card: hidden, shown, or shown with a "Got it" save that is refused. */
export type FixtureWelcome = "off" | "on" | "fails";

/** "Got it" on the welcome card saves nothing here (the fixture has no database), or is refused. */
const fixtureDismissWelcome = () => Promise.resolve({ success: true as const, data: null });
const fixtureRefusedWelcome = () => Promise.resolve({ success: false as const, error: "Could not close the welcome. Try again." });

/**
 * The Dashboard's key, as on /app: the team, so per-team state (the welcome
 * card) follows a team switch, and the filters. The list is read once, so it
 * also remounts when the tab has stored artifacts; with none, nothing
 * remounts after hydration.
 */
function dashboardKey(team: string | null, projectFilter: ProjectFilter | null, tags: readonly string[], hasStored: boolean): string {
  return `${team ?? "mine"}:${projectFilterId(projectFilter)}:${tags.join(",")}:${String(hasStored)}`;
}

/** The viewer's teams, with the shared ones under `scopes`, and the one `team` opens as the scope. */
function fixtureScope(scopes: boolean, team: string | null): { teams: ShareTeam[]; scopeTeam: ShareTeam | null } {
  if (!scopes) return { teams: fixtureTeams, scopeTeam: null };
  return { teams: [...fixtureTeams, ...fixtureSharedTeams], scopeTeam: fixtureSharedTeams.find((item) => item.slug === team) ?? null };
}

/**
 * Development only: the real /app workspace (frame, header, list, editor)
 * with long artifacts, a long list, and projects, and no database. Every
 * artifact is handed in full, so none loads. Project changes stay in
 * memory. The app shell and sidebar projects e2e tests use it. With
 * `scopes`, the viewer is also in shared teams, so the workspace switcher lists them, and
 * `team` opens one of them as the scope. `linkFailed` stands in for a link
 * the server could not check (a read limit, or a database error). With
 * `slowLoad`, the Long markdown fixture is not handed in full: it loads when
 * opened, and the load waits until a test releases it (`window.fixture`).
 * `many` adds 300 older notes, so the list holds the newest 100 as on /app,
 * and `tags` filters the list as the URL's tag filter does. `welcome` shows
 * a new member's welcome card on the team workspace `team` opens; with
 * "fails", its "Got it" save is refused.
 */
export function WorkspaceFixture({ projectFilter, link = null, linkFailed = false, slowLoad = false, scopes = false, team = null, many = false, tags = noTags, welcome = "off" }: { projectFilter: ProjectFilter | null; link?: ArtifactLink | null; linkFailed?: boolean; slowLoad?: boolean; scopes?: boolean; team?: string | null; many?: boolean; tags?: string[]; welcome?: FixtureWelcome }) {
  const inBrowser = useInBrowser();
  // Artifacts New artifact stored in this tab come first, as the server would list them after a reload.
  const stored = useMemo(() => (inBrowser ? storedFixtureArtifacts() : []), [inBrowser]);
  // Kept from the first load, as `slowLoad` is: the sidebar's filter links drop `?many=1` from the URL.
  const [manyKept] = useState(many);
  const base = useMemo(() => [...stored, ...withTeamArtifact(fixtureArtifacts(manyKept), scopes)], [stored, manyKept, scopes]);
  const { state, api } = useFixtureProjects(base);
  const artifacts = useMemo(() => withProjects(base, state), [base, state]);
  const { items, tagFacets } = useFixtureList(artifacts, projectFilter, tags);
  const facets = useMemo(() => fixtureFacets(artifacts), [artifacts]);
  const notifications = useMemo(() => fixtureNotifications(), []);
  // As on /app: what the link finds, in the list or not (the workspace pins it to the top), or null when it is gone.
  const full = useMemo(() => [...artifacts, linkOnlyArtifact], [artifacts]);
  // Kept from the first load: a bell link drops `?slowload=1` from the URL, and the slow artifact must stay slow.
  const [slow] = useState(slowLoad);
  const controls = useFixtureControls(slow, full, slowPublicIds);
  const seeded = useMemo(() => (slow ? full.filter((artifact) => artifact.id !== SLOW_ARTIFACT_ID) : full), [full, slow]);
  const linkTarget = useMemo(() => {
    const found = link && !linkFailed ? full.find((artifact) => artifact.publicId === link.publicId) : undefined;
    return found ? toArtifactListItem(found) : null;
  }, [full, link, linkFailed]);
  return (
    <ConfirmationsProvider initial={[]}>
      <div className="workspace-frame">
        <AppHeader userId="fixture" name="Fixture" email="fixture@example.com" username="fixture" unreadNotifications={4} notificationSeed={notifications} feedbackSend={fixtureFeedbackSend} />
        <Dashboard
          key={dashboardKey(team, projectFilter, tags, stored.length > 0)}
          initialArtifacts={items}
          initialFull={seeded}
          loadArtifact={controls.loadArtifact}
          onLinkHandled={controls.onLinkHandled}
          origin="http://localhost"
          viewerId="fixture"
          {...fixtureScope(scopes, team)}
          facets={facets}
          projectRows={state.rows}
          projectFilter={projectFilter}
          tagFacets={tagFacets}
          tagFilter={tags}
          projectsApi={api}
          listPath="/dev/workspace"
          linkTarget={linkTarget}
          linkFailed={linkFailed}
          newArtifactApi={fixtureNewArtifactApi}
          welcome={welcome !== "off"}
          dismissWelcome={welcome === "fails" ? fixtureRefusedWelcome : fixtureDismissWelcome}
        />
      </div>
    </ConfirmationsProvider>
  );
}
