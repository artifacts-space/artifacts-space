"use client";

import { useState } from "react";

import type { ArtifactDto } from "@/lib/artifact-types";

import {
  ContentPane,
  DeleteDialog,
  MetaFields,
  ModeBar,
  ShareBanner,
  TitleFields,
  type EditorMode,
} from "./editor-sections";
import { EditorToolbar } from "./editor-toolbar";
import { useArtifactActions } from "./use-artifact-actions";
import { useArtifactDraft } from "./use-artifact-draft";

interface ArtifactEditorProps {
  artifact: ArtifactDto;
  origin: string;
  onUpdated: (artifact: ArtifactDto) => void;
  onDeleted: (id: string) => void;
}

/** Edit, share, and delete one artifact. */
export function ArtifactEditor({ artifact, origin, onUpdated, onDeleted }: ArtifactEditorProps) {
  const { draft, update, dirty } = useArtifactDraft(artifact);
  const { pending, shared, save, toggleSharing, remove } = useArtifactActions({ artifact, draft, onUpdated, onDeleted });
  const [mode, setMode] = useState<EditorMode>("edit");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const shareUrl = `${origin}/share/${artifact.shareId}`;

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={`Edit ${artifact.title}`}>
      <EditorToolbar
        id={artifact.id}
        kind={draft.kind}
        content={artifact.content}
        shared={shared}
        shareUrl={shareUrl}
        dirty={dirty}
        pending={pending}
        onSave={() => void save()}
        onToggleShare={() => void toggleSharing()}
        onRequestDelete={() => { setDeleteOpen(true); }}
      />
      {shared ? <ShareBanner shareUrl={shareUrl} /> : null}
      <TitleFields title={draft.title} summary={draft.summary} update={update} />
      <ModeBar mode={mode} onMode={setMode} length={draft.content.length} updatedAt={artifact.updatedAt} />
      <ContentPane mode={mode} kind={draft.kind} content={draft.content} update={update} />
      <MetaFields draft={draft} update={update} />
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={artifact.title}
        deleting={pending === "delete"}
        onConfirm={() => void remove(() => { setDeleteOpen(false); })}
      />
    </section>
  );
}
