"use client";

import { IconCopy, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  createTeamPresetAction,
  deleteTeamPresetAction,
  duplicateTeamPresetAction,
  presetUsageAction,
  updateTeamPresetAction,
} from "@/app/(workspace)/teams/theme-actions";
import { ThemeSwatch } from "@/components/artifact-theme/theme-swatch";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { siteDefaultTheme } from "@/lib/themes/resolve";
import type { TeamPresetDto, TeamThemeSettings } from "@/lib/themes/team-presets";
import { teamPresetLimits } from "@/lib/themes/team-preset-limits";
import { presetDeleteMessage } from "@/lib/themes/team-preset-rules";

import { PresetEditorDialog, type PresetSaveInput } from "./preset-editor-dialog";
import { TeamDefaultTheme } from "./team-default-theme";
import { useTeamAction } from "./use-team-action";

type Editing = { kind: "new" } | { kind: "edit"; preset: TeamPresetDto } | null;

interface PresetRowProps {
  preset: TeamPresetDto;
  isDefault: boolean;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function PresetRow({ preset, isDefault, canManage, busy, onEdit, onDuplicate, onDelete }: PresetRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3" data-team-preset={preset.ref}>
      <div className="card-nested w-28 shrink-0 overflow-hidden rounded-lg"><ThemeSwatch theme={preset.theme} /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-md font-medium">{preset.name}{isDefault ? <span className="ml-2 text-xs font-normal text-muted-foreground">Team default</span> : null}</p>
        {preset.description ? <p className="truncate text-sm text-muted-foreground">{preset.description}</p> : null}
        <p className="truncate font-mono text-xs text-muted-foreground">{preset.ref}</p>
      </div>
      {canManage ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} disabled={busy} aria-label={`Edit ${preset.name}`}><IconPencil /> Edit</Button>
          <Button variant="ghost" size="icon-sm" onClick={onDuplicate} disabled={busy} aria-label={`Duplicate ${preset.name}`} title="Duplicate"><IconCopy /></Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} disabled={busy} aria-label={`Delete ${preset.name}`} title="Delete"><IconTrash /></Button>
        </div>
      ) : null}
    </li>
  );
}

/** Delete with a confirm that says how many artifacts use the preset first; "Don't ask again" skips it. */
function useDeletePreset(teamId: string) {
  const router = useRouter();
  const confirm = useConfirm("deleteTeamPreset");
  const [target, setTarget] = useState<{ preset: TeamPresetDto; usage: { artifacts: number; isDefault: boolean } | null } | null>(null);

  async function remove(preset: TeamPresetDto) {
    const result = await deleteTeamPresetAction(teamId, preset.id);
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    toast.success("Preset deleted.");
    router.refresh();
    return true;
  }

  async function request(preset: TeamPresetDto) {
    const usage = await presetUsageAction(teamId, preset.id).catch(() => null);
    setTarget({ preset, usage: usage?.success ? usage.data : null });
    confirm.request(() => remove(preset).catch(() => false));
  }

  return { request, dialog: confirm.dialog, target };
}

function PresetsHeader({ canManage, full, onNew }: { canManage: boolean; full: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <p className="text-md font-medium">Team presets</p>
        <p className="text-sm text-muted-foreground">
          {canManage ? "Your team's own looks. Members pick them for artifacts shared with the team." : "Your team's own looks. Owners and admins manage them."}
        </p>
      </div>
      {canManage ? (
        <Button size="sm" onClick={onNew} disabled={full} title={full ? `A team can keep ${String(teamPresetLimits.maxPerTeam)} presets.` : undefined}>
          <IconPlus /> New preset
        </Button>
      ) : null}
    </div>
  );
}

interface PresetListProps {
  teamId: string;
  settings: TeamThemeSettings;
  canManage: boolean;
  onEdit: (preset: TeamPresetDto) => void;
}

function PresetList({ teamId, settings, canManage, onEdit }: PresetListProps) {
  const { pending, run } = useTeamAction();
  const remove = useDeletePreset(teamId);
  if (settings.presets.length === 0) {
    return <p className="px-5 py-4 text-md text-muted-foreground">No team presets yet.{canManage ? " Start from a built-in theme and make it yours." : ""}</p>;
  }
  return (
    <>
      <ul className="divide-y">
        {settings.presets.map((preset) => (
          <PresetRow
            key={preset.id}
            preset={preset}
            isDefault={settings.defaultTheme === preset.ref}
            canManage={canManage}
            busy={pending !== null}
            onEdit={() => { onEdit(preset); }}
            onDuplicate={() => void run(`duplicate-${preset.id}`, () => duplicateTeamPresetAction(teamId, preset.id), "Preset duplicated.")}
            onDelete={() => void remove.request(preset)}
          />
        ))}
      </ul>
      <ConfirmDialog state={remove.dialog} title={`Delete ${remove.target?.preset.name ?? "this preset"}?`} description={presetDeleteMessage(remove.target?.usage ?? null)} confirmLabel="Delete preset" />
    </>
  );
}

const blankStart = () => ({ name: "", description: "", theme: siteDefaultTheme() });

/**
 * Team themes in team settings: the team default, and the team's own
 * presets. Every member sees them; owners and admins create, edit,
 * duplicate, and delete presets and set the default. None of this files an
 * artifact version: artifacts refer to presets live.
 */
export function TeamThemes({ teamId, settings, canManage }: { teamId: string; settings: TeamThemeSettings; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);

  async function save(input: PresetSaveInput) {
    const existing = editing?.kind === "edit" ? editing.preset : null;
    const result = existing ? await updateTeamPresetAction(teamId, existing.id, input) : await createTeamPresetAction(teamId, input);
    if (result.success) {
      toast.success(existing ? "Preset saved. Artifacts that use it show the change." : "Preset created.");
      setEditing(null);
      router.refresh();
    }
    return result;
  }

  return (
    <div className="divide-y">
      <TeamDefaultTheme teamId={teamId} settings={settings} canManage={canManage} />
      <PresetsHeader canManage={canManage} full={settings.presets.length >= teamPresetLimits.maxPerTeam} onNew={() => { setEditing({ kind: "new" }); }} />
      <PresetList teamId={teamId} settings={settings} canManage={canManage} onEdit={(preset) => { setEditing({ kind: "edit", preset }); }} />
      {editing ? (
        <PresetEditorDialog
          key={editing.kind === "edit" ? editing.preset.id : "new"}
          kind={editing.kind}
          start={editing.kind === "edit" ? editing.preset : blankStart()}
          teamPresets={settings.presets}
          onSave={save}
          onClose={() => { setEditing(null); }}
        />
      ) : null}
    </div>
  );
}
