"use client";

import { useMemo } from "react";

import { AppHeader } from "@/components/app/app-header";
import { Dashboard } from "@/components/app/dashboard";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ArtifactDto } from "@/lib/artifact-types";

import { fixtureArtifact, longCsv, longJson, longMarkdown, longUi } from "./fixture-content";
import { fixtureNotifications } from "./notification-fixture";

/** Four long artifacts first, then enough short ones that the list scrolls. */
function fixtureArtifacts(): ArtifactDto[] {
  const long = [
    fixtureArtifact({ id: "fixture-ui", kind: "ui", title: "Long ui fixture", content: longUi(), publicId: "fixtureworkspace0000ui" }),
    fixtureArtifact({ id: "fixture-markdown", kind: "markdown", title: "Long markdown fixture", content: longMarkdown(), publicId: "fixtureworkspace000md" }),
    fixtureArtifact({ id: "fixture-csv", kind: "csv", title: "Long csv fixture", content: longCsv(), publicId: "fixtureworkspace00csv" }),
    fixtureArtifact({ id: "fixture-json", kind: "json", title: "Long json fixture", content: longJson(), publicId: "fixtureworkspace0json" }),
  ];
  const short = Array.from({ length: 36 }, (_, index) =>
    fixtureArtifact({ id: `fixture-note-${String(index)}`, kind: "text", title: `Note ${String(index + 1)}`, content: `Note ${String(index + 1)}.`, publicId: `fixtureworkspacenote${String(index).padStart(2, "0")}` }),
  );
  return [...long, ...short];
}

/**
 * Development only: the real /app workspace (frame, header, list, editor)
 * with long artifacts and a long list, and no database. Every artifact is
 * handed in full, so none loads. The app shell e2e test measures it.
 */
export function WorkspaceFixture() {
  const artifacts = useMemo(() => fixtureArtifacts(), []);
  const items = useMemo(() => artifacts.map(toArtifactListItem), [artifacts]);
  const notifications = useMemo(() => fixtureNotifications(), []);
  return (
    <ConfirmationsProvider initial={[]}>
      <div className="workspace-frame">
        <AppHeader userId="fixture" name="Fixture" email="fixture@example.com" username="fixture" teams={[]} unreadNotifications={4} notificationSeed={notifications} />
        <Dashboard
          initialArtifacts={items}
          initialFull={artifacts}
          origin="http://localhost"
          viewerId="fixture"
          teams={[]}
          scopeTeam={null}
          facets={{ projects: [], none: artifacts.length, total: artifacts.length }}
          projectFilter={null}
          tagFacets={[]}
          tagFilter={[]}
        />
      </div>
    </ConfirmationsProvider>
  );
}
