"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { AppHeader } from "@/components/app/app-header";
import { Dashboard } from "@/components/app/dashboard";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import type { ArtifactLink } from "@/lib/app-link";
import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ArtifactDto } from "@/lib/artifact-types";
import { projectFilterId } from "@/lib/projects/filter-params";
import type { ProjectFilter } from "@/lib/projects/rules";
import { matchesProjectFilter } from "@/lib/projects/sidebar-rules";

import { fixtureArtifact, longCsv, longJson, longMarkdown, longUi } from "./fixture-content";
import { createFixtureProjectsStore, fixtureFacets, LOCKED_TITLE, withProjects } from "./fixture-projects";
import { fixtureNotifications } from "./notification-fixture";

/** The viewer's personal team, so the Share dialog can offer link and public sharing. It adds no scope tab. */
const fixtureTeams: ShareTeam[] = [{ id: "fixture-team", slug: "fixture", name: "Fixture", personal: true, role: "owner", teamSharingNeedsApproval: false }];

/** Four long artifacts first, then enough short ones that the list scrolls. Note 2 has comments on; Note 9 has a theme. */
function fixtureArtifacts(): ArtifactDto[] {
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
  return [...long, ...short.map((note, index): ArtifactDto => {
    if (index === 1) return { ...note, comments: "team" };
    if (index === 8) return { ...note, theme: "ocean", kind: "markdown", content: "# Ocean notes\n\nThe preview wears this artifact's theme." };
    return note;
  })];
}

/** The fixture's projects in memory, and a stand-in for the project server actions over them. */
function useFixtureProjects(artifacts: readonly ArtifactDto[]) {
  const [store] = useState(() => createFixtureProjectsStore(new Map(artifacts.map((artifact) => [artifact.id, artifact.title]))));
  const state = useSyncExternalStore(store.subscribe, store.read, store.read);
  return { state, api: store.api };
}

/**
 * Development only: the real /app workspace (frame, header, list, editor)
 * with long artifacts, a long list, and projects, and no database. Every
 * artifact is handed in full, so none loads. Project changes stay in
 * memory. The app shell and sidebar projects e2e tests use it.
 */
export function WorkspaceFixture({ projectFilter, link = null }: { projectFilter: ProjectFilter | null; link?: ArtifactLink | null }) {
  const base = useMemo(() => fixtureArtifacts(), []);
  const { state, api } = useFixtureProjects(base);
  const artifacts = useMemo(() => withProjects(base, state), [base, state]);
  const items = useMemo(() => artifacts.filter((artifact) => matchesProjectFilter(artifact.project, projectFilter)).map(toArtifactListItem), [artifacts, projectFilter]);
  const facets = useMemo(() => fixtureFacets(artifacts), [artifacts]);
  const notifications = useMemo(() => fixtureNotifications(), []);
  return (
    <ConfirmationsProvider initial={[]}>
      <div className="workspace-frame">
        <AppHeader userId="fixture" name="Fixture" email="fixture@example.com" username="fixture" teams={[]} unreadNotifications={4} notificationSeed={notifications} />
        <Dashboard
          key={projectFilterId(projectFilter)}
          initialArtifacts={items}
          initialFull={artifacts}
          origin="http://localhost"
          viewerId="fixture"
          teams={fixtureTeams}
          scopeTeam={null}
          facets={facets}
          projectRows={state.rows}
          projectFilter={projectFilter}
          tagFacets={[]}
          tagFilter={[]}
          projectsApi={api}
          listPath="/dev/workspace"
          link={link}
        />
      </div>
    </ConfirmationsProvider>
  );
}
