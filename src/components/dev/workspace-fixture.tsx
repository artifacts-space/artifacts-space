"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { AppHeader } from "@/components/app/app-header";
import { Dashboard } from "@/components/app/dashboard";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ArtifactDto } from "@/lib/artifact-types";
import { projectFilterId } from "@/lib/projects/filter-params";
import type { ProjectFilter } from "@/lib/projects/rules";
import { matchesProjectFilter } from "@/lib/projects/sidebar-rules";

import { fixtureArtifact, longCsv, longJson, longMarkdown, longUi } from "./fixture-content";
import { createFixtureProjectsStore, fixtureFacets, LOCKED_TITLE, withProjects } from "./fixture-projects";

/** Four long artifacts first, then enough short ones that the list scrolls. */
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
  return [...long, ...short];
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
export function WorkspaceFixture({ projectFilter }: { projectFilter: ProjectFilter | null }) {
  const base = useMemo(() => fixtureArtifacts(), []);
  const { state, api } = useFixtureProjects(base);
  const artifacts = useMemo(() => withProjects(base, state), [base, state]);
  const items = useMemo(() => artifacts.filter((artifact) => matchesProjectFilter(artifact.project, projectFilter)).map(toArtifactListItem), [artifacts, projectFilter]);
  const facets = useMemo(() => fixtureFacets(artifacts), [artifacts]);
  return (
    <ConfirmationsProvider initial={[]}>
      <div className="workspace-frame">
        <AppHeader userId="fixture" name="Fixture" email="fixture@example.com" username="fixture" teams={[]} unreadMentions={0} />
        <Dashboard
          key={projectFilterId(projectFilter)}
          initialArtifacts={items}
          initialFull={artifacts}
          origin="http://localhost"
          viewerId="fixture"
          teams={[]}
          scopeTeam={null}
          facets={facets}
          projectRows={state.rows}
          projectFilter={projectFilter}
          tagFacets={[]}
          tagFilter={[]}
          projectsApi={api}
          listPath="/dev/workspace"
        />
      </div>
    </ConfirmationsProvider>
  );
}
