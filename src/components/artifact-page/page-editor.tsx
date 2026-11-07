"use client";

import { IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { updateArtifactAction } from "@/app/(workspace)/app/actions";
import { ContentPane, type EditorMode } from "@/components/app/artifact-editor/content-pane";
import { ModeBar } from "@/components/app/artifact-editor/editor-sections";
import type { ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { DocumentEditor, isDocumentKind } from "@/components/editor/document-editor";
import { FormError } from "@/components/teams/form-error";
import { Button } from "@/components/ui/button";
import { formatInfo } from "@/lib/artifact-formats";
import type { ArtifactDto } from "@/lib/artifact-types";

import { CsvContentEditor } from "./csv-content-editor";
import { useLeaveGuard } from "./use-leave-guard";

interface PageDraft {
  title: string;
  summary: string;
  content: string;
}

function draftProblem(draft: PageDraft, kind: ArtifactDto["kind"]) {
  if (!draft.title.trim()) return "Add a title.";
  if (kind !== "file" && !draft.content.trim()) return "Add some content.";
  return "";
}

function savedMessage(saved: ArtifactDto) {
  return saved.pendingEdit ? "Saved. Readers outside the team see it once a team owner or admin approves it." : "Saved.";
}

interface SourceEditorProps {
  artifact: ArtifactDto;
  content: string;
  title: string;
  onChange: (value: string) => void;
}

/**
 * Source formats (ui, JSON, code, SVG, Mermaid, File notes) edit exactly as
 * in the workspace editor: Edit and Preview tabs over one full-width pane,
 * the source in a field that grows with it, and the format check under it.
 * It opens on Edit. Nothing in it scrolls on its own, so the page keeps its
 * place and its height always ends at the footer.
 */
function SourceEditor({ artifact, content, title, onChange }: SourceEditorProps) {
  const [mode, setMode] = useState<EditorMode>("edit");
  // The workspace pane edits a whole draft; on this page only the content goes through it.
  function update<K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) {
    if (key === "content" && typeof value === "string") onChange(value);
  }
  return (
    <div className="card-surface flex flex-col overflow-hidden">
      <ModeBar mode={mode} onMode={setMode} length={content.length} updatedAt={artifact.updatedAt} updatedBy={artifact.updatedBy} />
      <ContentPane mode={mode} kind={artifact.kind} content={content} language={artifact.language} title={title} files={artifact.files} update={update} />
    </div>
  );
}

interface PageEditorProps {
  artifact: ArtifactDto;
  /** Called after a save or a cancel, with the saved artifact when there was a save. */
  onClose: (saved: ArtifactDto | null) => void;
}

/**
 * The in-place editor on an artifact's page: title, summary, and content with
 * a live preview. Saves go through the same action as the workspace editor,
 * and a save is refused when someone else saved since the editor opened.
 */
export function PageEditor({ artifact, onClose }: PageEditorProps) {
  const [draft, setDraft] = useState<PageDraft>({ title: artifact.title, summary: artifact.summary, content: artifact.content });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const confirmDiscard = useConfirm("discardEdits");
  const dirty = draft.title !== artifact.title || draft.summary !== artifact.summary || draft.content !== artifact.content;
  useLeaveGuard(dirty && !saving);

  const change = (key: keyof PageDraft) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };

  async function save() {
    const problem = draftProblem(draft, artifact.kind);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const result = await updateArtifactAction(artifact.id, draft, { expectedUpdatedAt: artifact.updatedAt });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(savedMessage(result.data));
      onClose(result.data);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (!dirty) {
      onClose(null);
      return;
    }
    confirmDiscard.request(() => {
      onClose(null);
      return Promise.resolve(true);
    });
  }

  return (
    <form
      noValidate
      aria-label={`Edit ${artifact.title}`}
      onSubmit={(event) => { event.preventDefault(); if (!saving) void save(); }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          if (!saving) void save();
        }
      }}
    >
      <div data-slot="editor-bar" className="sticky top-(--artifact-chrome-height,0px) z-10 -mx-6 flex items-center gap-2 border-b bg-background/95 px-6 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          Editing <span className="text-foreground">{formatInfo[artifact.kind].label}</span>
          {dirty ? " · Unsaved changes" : ""}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="ghost" onClick={cancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? <IconLoader2 className="animate-spin" /> : <IconDeviceFloppy />} Save
          </Button>
        </div>
      </div>
      {error ? <div className="mt-4"><FormError message={error} /></div> : null}
      <div className="mt-6 space-y-3">
        <ArtifactIcon icon={artifact.icon} size="page" />
        <input
          value={draft.title}
          onChange={(event) => { change("title")(event.target.value); }}
          aria-label="Title"
          placeholder="Untitled artifact"
          className="w-full bg-transparent text-balance text-3xl font-medium leading-[1.1] tracking-[-0.03em] outline-none placeholder:text-muted-foreground/60 sm:text-4xl"
        />
        <input
          value={draft.summary}
          onChange={(event) => { change("summary")(event.target.value); }}
          aria-label="Summary"
          placeholder="Add a one-line summary"
          className="w-full bg-transparent text-md leading-7 text-muted-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      <div className="mt-6">
        {artifact.kind === "csv" ? (
          <CsvContentEditor value={draft.content} onChange={change("content")} title={draft.title} files={artifact.files} label="Content" />
        ) : isDocumentKind(artifact.kind) ? (
          <DocumentEditor kind={artifact.kind} value={draft.content} onChange={change("content")} label="Content" autoFocus />
        ) : (
          <SourceEditor artifact={artifact} content={draft.content} title={draft.title} onChange={change("content")} />
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Save with ⌘S or Ctrl+S. Every save is kept in the history.</p>
      <ConfirmDialog
        state={confirmDiscard.dialog}
        title="Discard your changes?"
        description="The edits you made since you opened the editor will be lost. The saved artifact stays as it is."
        confirmLabel="Discard"
      />
    </form>
  );
}
