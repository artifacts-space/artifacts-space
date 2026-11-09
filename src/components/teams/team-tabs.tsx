"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  artifactViewLabels,
  isArtifactView,
  isTeamTab,
  teamTabLabels,
  teamTabSearch,
  type ArtifactView,
  type TeamTab,
  type TeamTabSelection,
} from "@/lib/teams/team-tabs-rules";

/** One tab, or one view inside Shared artifacts, with its content rendered on the server. */
export interface TabPanel<T extends string> {
  id: T;
  /** Shown as a badge after the label when above zero, such as requests that need approval. */
  count?: number;
  content: React.ReactNode;
}

function CountBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-medium text-background tabular-nums">{count}</span>;
}

/** The selection from the server; a new one (a notification link opened on this page) replaces the one on screen. */
function useSelection(initial: TeamTabSelection) {
  const [state, setState] = useState({ initial, selection: initial });
  if (state.initial.tab !== initial.tab || state.initial.view !== initial.view) setState({ initial, selection: initial });
  const setSelection = (selection: TeamTabSelection) => { setState((current) => ({ ...current, selection })); };
  return { selection: state.selection, setSelection };
}

function ArtifactViews({ views, value, onChange }: { views: TabPanel<ArtifactView>[]; value: ArtifactView; onChange: (view: ArtifactView) => void }) {
  if (views.length === 1) return <>{views[0]?.content}</>;
  return (
    <Tabs value={value} onValueChange={(next) => { if (isArtifactView(next)) onChange(next); }} className="gap-4">
      <TabsList aria-label="Shared artifacts views" className="max-w-full justify-start overflow-x-auto">
        {views.map((view) => (
          <TabsTrigger key={view.id} value={view.id} className="flex-none px-2.5">
            {artifactViewLabels[view.id]} <CountBadge count={view.count} />
          </TabsTrigger>
        ))}
      </TabsList>
      {views.map((view) => <TabsContent key={view.id} value={view.id}>{view.content}</TabsContent>)}
    </Tabs>
  );
}

/**
 * The team page's tabs. Each tab and each Shared artifacts view has its own
 * URL (team-tabs-rules.ts); switching replaces the URL without a reload, so
 * a copied link or a reload opens the same place.
 */
export function TeamTabs({ tabs, views, initial }: { tabs: TabPanel<TeamTab>[]; views: TabPanel<ArtifactView>[]; initial: TeamTabSelection }) {
  const pathname = usePathname();
  const { selection, setSelection } = useSelection(initial);

  function select(next: TeamTabSelection) {
    setSelection(next);
    window.history.replaceState(window.history.state, "", `${pathname}${teamTabSearch(next)}`);
  }

  return (
    <Tabs value={selection.tab} onValueChange={(tab) => { if (isTeamTab(tab)) select({ ...selection, tab }); }} className="gap-6">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList variant="line" aria-label="Team sections" className="justify-start">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex-none px-2.5">
              {teamTabLabels[tab.id]} <CountBadge count={tab.count} />
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="space-y-6">
          {tab.id === "artifacts" ? <ArtifactViews views={views} value={selection.view} onChange={(view) => { select({ ...selection, view }); }} /> : tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
