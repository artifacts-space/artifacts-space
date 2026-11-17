"use client";

import { askToAttach } from "@/components/files/attach-bridge";
import { AttachedFiles, type AttachFilesApi } from "@/components/files/attached-files";
import { usePageFileDrop } from "@/components/files/use-page-file-drop";
import { attachesBeside, looseFiles } from "@/lib/files/loose-rules";

import { usePageEdit, type PageEdit } from "./page-edit-context";

/** The whole page: a file dropped anywhere on it is attached. */
const wholePage = () => document.documentElement;

/**
 * The files attached beside the content, on the artifact's own page, for
 * someone who may edit it: the same quiet list as in /app, under the body.
 * Only for the formats that keep attachments beside their content
 * (attachesBeside): it takes "Attach file" from the header's More menu and
 * a file dropped anywhere on the page, and shows what was attached, with
 * Open, Replace, and Remove. It draws nothing for readers, while the
 * editable copy loads, for a document (its files go into its text), and
 * while there is no file to show.
 */
export function PageAttachedFiles({ api }: { api?: AttachFilesApi | undefined }) {
  const edit = usePageEdit();
  const attaches = edit !== null && attachesBeside(edit.draft.kind);
  return attaches ? <Listed edit={edit} api={api} /> : null;
}

function Listed({ edit, api }: { edit: PageEdit; api: AttachFilesApi | undefined }) {
  const { artifact, draft, onUpdated } = edit;
  const drop = usePageFileDrop({ root: wholePage, enabled: true, onFiles: (files) => { askToAttach(artifact.id, files); } });
  const loose = looseFiles(artifact.files, { kind: draft.kind, content: draft.content, icon: artifact.icon, cover: artifact.cover });
  return <AttachedFiles artifact={artifact} onUpdated={onUpdated} api={api} className="mt-10 rounded-lg border" quiet={{ files: loose, attach: true, dragging: drop.dragging }} />;
}
