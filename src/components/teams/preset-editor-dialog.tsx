"use client";

import { IconLoader2, IconWand } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/artifact-types";
import { builtInPresets } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import { teamPresetLimits } from "@/lib/themes/team-preset-limits";
import type { TeamPresetDto } from "@/lib/themes/team-presets";

import { FormError } from "./form-error";
import { PresetFormFields } from "./preset-form-fields";
import { PresetJsonTools } from "./preset-json-tools";
import { PresetPreview } from "./preset-preview";
import { usePresetEditor, type PresetEditorStart, type PresetEditorState } from "./use-preset-editor";

/** What the editor saves: the preset's fields. The server validates them again. */
export interface PresetSaveInput {
  name: string;
  description: string;
  theme: unknown;
}

interface PresetEditorDialogProps {
  /** "new" offers "Start from"; "edit" changes an existing preset; "save" makes a new preset from a theme already in use (an artifact's custom theme). */
  kind: "new" | "edit" | "save";
  start: PresetEditorStart;
  /** The team the preset belongs to, named in the title when saving a custom theme. */
  teamName?: string;
  /** The team's presets, to start a new one from. */
  teamPresets: readonly TeamPresetDto[];
  onSave: (input: PresetSaveInput) => Promise<ActionResult<TeamPresetDto>>;
  onClose: () => void;
}

/** Issues that belong to no single field: the theme as a whole, or its version. */
function generalIssues(issues: ReadonlyMap<string, string[]>): string[] {
  return ["(theme)", "version"].flatMap((path) => issues.get(path) ?? []);
}

function StartFrom({ teamPresets, onPick }: { teamPresets: readonly TeamPresetDto[]; onPick: (theme: Theme) => void }) {
  const builtIns = [...builtInPresets().values()];
  const [value, setValue] = useState("default");
  const names = new Map([...builtIns.map((preset) => [preset.id, preset.name] as const), ...teamPresets.map((preset) => [preset.ref, preset.name] as const)]);
  function pick(next: string | null) {
    if (!next) return;
    const theme = builtInPresets().get(next)?.theme ?? teamPresets.find((preset) => preset.ref === next)?.theme;
    if (!theme) return;
    setValue(next);
    onPick(theme);
  }
  return (
    <div className="flex flex-col gap-1">
      <Label id="preset-start-label">Start from</Label>
      <Select value={value} onValueChange={pick}>
        <SelectTrigger aria-labelledby="preset-start-label" className="h-9 w-full">
          <SelectValue>{(current: string) => names.get(current) ?? current}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Built-in</SelectLabel>
            {builtIns.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}
          </SelectGroup>
          {teamPresets.length > 0 ? (
            <SelectGroup>
              <SelectLabel>Team</SelectLabel>
              {teamPresets.map((preset) => <SelectItem key={preset.ref} value={preset.ref}>{preset.name}</SelectItem>)}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  );
}

function ContrastNotice({ editor, disabled }: { editor: PresetEditorState; disabled: boolean }) {
  if (editor.suggestions.length === 0) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
      <span className="text-muted-foreground">Some text is hard to read. The suggested colors pass WCAG AA.</span>
      <Button type="button" size="sm" variant="outline" onClick={editor.applySuggestions} disabled={disabled}>
        <IconWand /> Apply suggestions
      </Button>
    </div>
  );
}

function NameFields({ editor, disabled }: { editor: PresetEditorState; disabled: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="preset-name">Name</Label>
        <Input id="preset-name" value={editor.name} maxLength={teamPresetLimits.maxNameChars} disabled={disabled} onChange={(event) => { editor.setName(event.target.value); }} className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="preset-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="preset-description" value={editor.description} maxLength={teamPresetLimits.maxDescriptionChars} disabled={disabled} onChange={(event) => { editor.setDescription(event.target.value); }} className="h-9" />
      </div>
    </div>
  );
}

function JsonTab({ editor, disabled }: { editor: PresetEditorState; disabled: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="preset-json" className="text-xs font-normal text-muted-foreground">Theme JSON, as agents and the docs use it</Label>
      <Textarea id="preset-json" value={editor.jsonText} disabled={disabled} onChange={(event) => { editor.editJson(event.target.value); }} className="min-h-96 font-mono text-sm leading-5" spellCheck={false} aria-invalid={editor.jsonError ? true : undefined} />
      <FormError message={editor.jsonError} />
    </div>
  );
}

function dialogTitle(kind: PresetEditorDialogProps["kind"], start: PresetEditorStart, teamName: string | undefined): string {
  if (kind === "edit") return `Edit ${start.name}`;
  if (kind === "save") return teamName ? `Save as a ${teamName} preset` : "Save as team preset";
  return "New team preset";
}

/**
 * Creates or edits a team preset: a name, then the theme as a friendly form
 * or raw JSON, beside a live preview drawn with the real theme components.
 * Low contrast is refused with the suggested colors shown at each field and
 * one button to apply them all. Errors show inline; the form never uses
 * browser validation bubbles.
 */
export function PresetEditorDialog({ kind, start, teamName, teamPresets, onSave, onClose }: PresetEditorDialogProps) {
  const editor = usePresetEditor(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = editor.jsonError ? "Fix the JSON first." : editor.validation.ok ? "" : "The theme is not valid yet. Fix the fields marked in red.";
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await onSave({ name: editor.name, description: editor.description, theme: editor.draft });
      if (!result.success) setError(result.error);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const general = generalIssues(editor.issues);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <form onSubmit={(event) => void submit(event)} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{dialogTitle(kind, start, teamName)}</DialogTitle>
            <DialogDescription>Team members can pick it for their artifacts. Changes show on every artifact that uses it, at once.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto overscroll-contain p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <div className="min-w-0 space-y-4">
              <NameFields editor={editor} disabled={saving} />
              {kind === "new" ? <StartFrom teamPresets={teamPresets} onPick={editor.startFrom} /> : null}
              <PresetJsonTools editor={editor} disabled={saving} />
              <ContrastNotice editor={editor} disabled={saving} />
              {general.map((message) => <FormError key={message} message={message} />)}
              <Tabs defaultValue="form">
                <TabsList aria-label="Edit as">
                  <TabsTrigger value="form">Form</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="form" className="pt-3">
                  <PresetFormFields draft={editor.draft} onChange={editor.setDraft} issues={editor.issues} suggestions={editor.suggestions} revision={editor.revision} disabled={saving} />
                </TabsContent>
                <TabsContent value="json" className="pt-3">
                  <JsonTab editor={editor} disabled={saving} />
                </TabsContent>
              </Tabs>
            </div>
            <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
              <PresetPreview theme={editor.preview} />
            </div>
          </div>
          <DialogFooter className="m-0 flex-col items-stretch gap-2 rounded-none border-t bg-muted/40 px-5 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><FormError message={error} /></div>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <IconLoader2 className="animate-spin" /> : null} {kind === "edit" ? "Save preset" : "Create preset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
