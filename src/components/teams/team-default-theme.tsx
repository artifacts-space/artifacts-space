"use client";

import { useState } from "react";

import { defaultRevisionsAction, restoreDefaultRevisionAction, setTeamDefaultThemeAction } from "@/app/(workspace)/teams/theme-actions";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatExactTime } from "@/lib/relative-time";
import { DEFAULT_THEME_ID } from "@/lib/themes/presets";
import { builtInPresets, presetTheme, siteDefaultTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import type { TeamThemeSettings } from "@/lib/themes/team-presets";
import type { TeamThemeRevisionDto } from "@/lib/themes/team-theme-revisions";

import { HistoryPanel } from "./theme-history";
import { useTeamAction } from "./use-team-action";

const SITE_DEFAULT = "site";

function auditLine(settings: TeamThemeSettings): string | null {
  if (!settings.defaultSetAt) return null;
  const when = formatExactTime(new Date(settings.defaultSetAt));
  return settings.defaultSetBy ? `Last changed by ${settings.defaultSetBy}, ${when}.` : `Last changed ${when}.`;
}

/** The theme a default id draws with, for the history swatches; null when its preset is gone. */
function defaultThemeOf(id: string | null, settings: TeamThemeSettings): Theme | null {
  if (id === null) return siteDefaultTheme();
  return presetTheme(id) ?? settings.presets.find((preset) => preset.ref === id)?.theme ?? null;
}

/**
 * The team default theme: what artifacts shared with the team show when
 * they have no theme of their own. Owners and admins pick a built-in or a
 * team preset; everyone else sees which one it is. Who changed it last is
 * shown and logged, and owners and admins can restore an earlier default
 * from its history.
 */
export function TeamDefaultTheme({ teamId, settings, canManage }: { teamId: string; settings: TeamThemeSettings; canManage: boolean }) {
  const [value, setValue] = useState(settings.defaultTheme ?? SITE_DEFAULT);
  const { pending, run } = useTeamAction();
  const builtIns = [...builtInPresets().values()].filter((preset) => preset.id !== DEFAULT_THEME_ID);
  const names = new Map<string, string>([[SITE_DEFAULT, "Site default"], [DEFAULT_THEME_ID, "Default"], ...builtIns.map((preset) => [preset.id, preset.name] as const), ...settings.presets.map((preset) => [preset.ref, preset.name] as const)]);

  async function change(next: string | null) {
    if (!next || next === value) return;
    const previous = value;
    setValue(next);
    const saved = await run("default", () => setTeamDefaultThemeAction(teamId, next === SITE_DEFAULT ? null : next), "Team default saved.");
    if (!saved) setValue(previous);
  }

  async function restore(revision: TeamThemeRevisionDto): Promise<boolean> {
    const restored = await run("default", () => restoreDefaultRevisionAction(teamId, revision.id), "Team default restored.");
    if (restored) setValue(revision.defaultTheme ?? SITE_DEFAULT);
    return restored;
  }

  const audit = auditLine(settings);
  return (
    <div className="space-y-2 px-5 py-4">
      <Label id="team-default-theme-label" className="text-md font-medium">Team default</Label>
      <p id="team-default-theme-help" className="text-sm leading-5 text-muted-foreground">
        Artifacts shared with the team use it when they have no theme of their own, and readers outside the team see it too.
      </p>
      <Select value={value} onValueChange={(next: string | null) => void change(next)} disabled={!canManage || pending !== null}>
        <SelectTrigger aria-labelledby="team-default-theme-label" aria-describedby="team-default-theme-help" className="h-9 w-full sm:w-72" data-team-default-theme="">
          <SelectValue>{(current: string) => names.get(current) ?? "A removed preset"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SITE_DEFAULT}>Site default</SelectItem>
          {settings.presets.length > 0 ? (
            <SelectGroup>
              <SelectLabel>Team presets</SelectLabel>
              {settings.presets.map((preset) => <SelectItem key={preset.ref} value={preset.ref}>{preset.name}</SelectItem>)}
            </SelectGroup>
          ) : null}
          <SelectGroup>
            <SelectLabel>Built-in</SelectLabel>
            {builtIns.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      {audit || !canManage ? (
        <p className="text-xs text-muted-foreground">{[audit, canManage ? null : "Only owners and admins can change it."].filter(Boolean).join(" ")}</p>
      ) : null}
      {canManage ? (
        <HistoryPanel
          title="Team default history"
          load={() => defaultRevisionsAction(teamId)}
          onRestore={restore}
          describe={(revision) => ({ label: names.get(revision.defaultTheme ?? SITE_DEFAULT) ?? "A removed preset", theme: defaultThemeOf(revision.defaultTheme, settings) })}
          disabled={pending !== null}
        />
      ) : null}
    </div>
  );
}
