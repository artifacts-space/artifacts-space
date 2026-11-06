"use client";

import { useState } from "react";

import { ShareControl } from "@/components/app/share-control";
import { AttachedFiles } from "@/components/files/attached-files";
import type { ArtifactDto } from "@/lib/artifact-types";

import { ContentPane } from "./content-pane";
import {
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
  const { pending, save, remove } = useArtifactActions({ artifact, draft, onUpdated, onDeleted });
  const [mode, setMode] = useState<EditorMode>("preview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const shareUrl = `${origin}/artifact/${artifact.publicId}`;
  const shared = artifact.visibility === "link" || artifact.visibility === "public";

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={`Edit ${artifact.title}`}>
      <EditorToolbar
        id={artifact.id}
        kind={draft.kind}
        content={artifact.content}
        shareControl={<ShareControl artifact={artifact} shareUrl={shareUrl} onUpdated={onUpdated} />}
        dirty={dirty}
        pending={pending}
        onSave={() => void save()}
        onRequestDelete={() => { setDeleteOpen(true); }}
      />
      {shared ? <ShareBanner shareUrl={shareUrl} isPublic={artifact.visibility === "public"} /> : null}
      <TitleFields title={draft.title} summary={draft.summary} update={update} />
      <ModeBar mode={mode} onMode={setMode} length={draft.content.length} updatedAt={artifact.updatedAt} />
      <ContentPane mode={mode} kind={draft.kind} content={draft.content} language={draft.language} title={draft.title} files={artifact.files} update={update} />
      {draft.kind === "file" || draft.kind === "ui" || artifact.files.length > 0 ? <AttachedFiles artifact={artifact} onUpdated={onUpdated} /> : null}
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
