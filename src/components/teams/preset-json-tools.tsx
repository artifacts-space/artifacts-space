"use client";

import { IconCheck, IconCopy, IconDownload, IconFileUpload, IconUpload } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";

import { useCopyToClipboard } from "@/components/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importThemeJson, THEME_IMPORT_MAX_FILE_BYTES, themeExportJson, themeFileName } from "@/lib/themes/theme-import";

import { FormError } from "./form-error";
import type { PresetEditorState } from "./use-preset-editor";

/** Saves text as a file through a temporary link. */
function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // One-off cleanup once the browser has taken the file.
  window.setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}

/** Reads a picked theme file as text, or explains why it cannot. */
async function readThemeFile(file: File): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (file.size > THEME_IMPORT_MAX_FILE_BYTES) return { ok: false, message: "That file is too large to be a theme. A theme is about 2 KB of JSON." };
  try {
    return { ok: true, text: await file.text() };
  } catch {
    return { ok: false, message: "That file could not be read. Try another one." };
  }
}

interface ImportPanelProps {
  disabled: boolean;
  onImported: (message: string) => void;
  editor: PresetEditorState;
}

/** Paste theme JSON or pick a .json file; it replaces the draft only when it can be used. */
function ImportPanel({ disabled, onImported, editor }: ImportPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function apply(input: string) {
    const result = importThemeJson(input);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError("");
    editor.importDraft(result.draft);
    onImported(result.message);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    const read = await readThemeFile(file);
    if (!read.ok) {
      setError(read.message);
      return;
    }
    setText(read.text);
    apply(read.text);
  }

  return (
    <div className="card-nested space-y-2 rounded-lg p-3" data-preset-import>
      <Label htmlFor="preset-import-json">Theme JSON to import</Label>
      <Textarea
        id="preset-import-json"
        value={text}
        disabled={disabled}
        onChange={(event) => { setText(event.target.value); }}
        placeholder='{ "version": 1, "light": { … }, "dark": { … } }'
        className="min-h-32 font-mono text-base leading-5 sm:text-sm"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
      />
      <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Theme file" onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => { apply(text); }} disabled={disabled}><IconUpload /> Import</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { fileRef.current?.click(); }} disabled={disabled}><IconFileUpload /> Choose a file</Button>
      </div>
    </div>
  );
}

/**
 * Import and export for the team preset editor. Export copies or downloads
 * the theme exactly as agents and the docs use it (only while it is valid).
 * Import replaces the draft with pasted or uploaded theme JSON, checked like
 * a save; a theme that only fails contrast loads with suggestions.
 */
export function PresetJsonTools({ editor, disabled }: { editor: PresetEditorState; disabled: boolean }) {
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const { copied, copy } = useCopyToClipboard();
  const panelId = useId();
  const exportJson = editor.exportable ? themeExportJson(editor.exportable) : null;
  const exportHint = exportJson ? undefined : "Fix the theme first to export it.";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" aria-expanded={importing} aria-controls={panelId} onClick={() => { setImporting((open) => !open); setNotice(""); }} disabled={disabled}>
          <IconFileUpload /> Import JSON
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !exportJson} title={exportHint} onClick={() => { if (exportJson) void copy(exportJson); }}>
          {copied ? <IconCheck /> : <IconCopy />} {copied ? "Copied" : "Copy JSON"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !exportJson} title={exportHint} onClick={() => { if (exportJson) downloadText(themeFileName(editor.name), exportJson); }}>
          <IconDownload /> Download JSON
        </Button>
      </div>
      <div id={panelId}>
        {importing ? <ImportPanel editor={editor} disabled={disabled} onImported={(message) => { setImporting(false); setNotice(message); }} /> : null}
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  );
}
