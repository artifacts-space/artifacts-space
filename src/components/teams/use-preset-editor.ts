"use client";

import { useMemo, useState } from "react";

import { contrastSuggestions } from "@/lib/themes/artifact-theme";
import type { ContrastChange } from "@/lib/themes/contrast";
import { applyContrastChanges, draftFromJson, draftFromTheme, draftJson, issuesByPath, type ThemeDraft } from "@/lib/themes/preset-draft";
import { parseTheme, parseThemeForPreview, type Theme } from "@/lib/themes/schema";

/** What the editor starts from: an existing preset, or a theme to copy for a new one. */
export interface PresetEditorStart {
  name: string;
  description: string;
  theme: Theme;
}

/**
 * State for the team preset editor: the draft (shared by the form and the
 * raw JSON tab), its validation by field, contrast suggestions, and the
 * last draft that parsed, for the live preview. Validation is parseTheme,
 * the same check the server runs.
 */
export function usePresetEditor(start: PresetEditorStart) {
  const [name, setName] = useState(start.name);
  const [description, setDescription] = useState(start.description);
  const [draft, setDraftState] = useState<ThemeDraft>(() => draftFromTheme(start.theme));
  const [jsonText, setJsonText] = useState(() => draftJson(draftFromTheme(start.theme)));
  const [jsonError, setJsonError] = useState("");
  // Bumped when the draft changes from outside the form, so uncontrolled helpers (the chart box) reset.
  const [revision, setRevision] = useState(0);
  // The last draft that parsed, so the preview holds still while a color is half typed.
  const [preview, setPreview] = useState<Theme>(start.theme);

  const validation = useMemo(() => parseTheme(draft), [draft]);
  const issues = useMemo(() => (validation.ok ? new Map<string, string[]>() : issuesByPath(validation.issues)), [validation]);
  const suggestions = useMemo<ContrastChange[]>(() => (validation.ok ? [] : contrastSuggestions(draft)), [validation, draft]);

  function storeDraft(next: ThemeDraft) {
    setDraftState(next);
    const drawable = parseThemeForPreview(next);
    if (drawable) setPreview(drawable);
  }

  /** A change from the form: the JSON tab follows. */
  function setDraft(next: ThemeDraft) {
    storeDraft(next);
    setJsonText(draftJson(next));
    setJsonError("");
  }

  /** A change from outside the form (start from a preset, apply suggestions). */
  function replaceDraft(next: ThemeDraft) {
    setDraft(next);
    setRevision((value) => value + 1);
  }

  /** A change in the raw JSON tab: the form follows when it reads. */
  function editJson(text: string) {
    setJsonText(text);
    const parsed = draftFromJson(text, draft);
    if (!parsed.ok) {
      setJsonError(parsed.message);
      return;
    }
    setJsonError("");
    storeDraft(parsed.draft);
    setRevision((value) => value + 1);
  }

  return {
    name,
    setName,
    description,
    setDescription,
    draft,
    setDraft,
    startFrom: (theme: Theme) => { replaceDraft(draftFromTheme(theme)); },
    /** Replaces the whole draft with imported theme JSON (theme-import.ts); the form and JSON tab follow. */
    importDraft: (next: ThemeDraft) => { replaceDraft(next); },
    /** The theme as it would save, or null while it is not valid: what Export writes. */
    exportable: validation.ok ? validation.theme : null,
    applySuggestions: () => { replaceDraft(applyContrastChanges(draft, suggestions)); },
    jsonText,
    jsonError,
    editJson,
    revision,
    validation,
    issues,
    suggestions,
    preview,
  };
}

export type PresetEditorState = ReturnType<typeof usePresetEditor>;
