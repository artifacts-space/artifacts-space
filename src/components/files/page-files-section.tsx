"use client";

import { IconFolderPlus, IconPaperclip } from "@tabler/icons-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useLeaveGuard } from "@/components/artifact-page/use-leave-guard";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ArtifactDto } from "@/lib/artifact-types";
import { formatBytes } from "@/lib/files/config";
import { ADD_FILES_LABEL, dropHint, looseFilesWords } from "@/lib/files/loose-rules";
import { offersReplace } from "@/lib/files/replace-rules";
import type { FileDto } from "@/lib/files/types";
import { htmlProblem } from "@/lib/html/rules";
import { inPathOrder, pageFilesTotalsWords, publishedWords } from "@/lib/page-files/batch-rules";
import type { HeldPageFile } from "@/lib/page-files/publish-rules";
import { leftOutWords } from "@/lib/page-files/drop-rules";

import { AttachedRow, FilesFrame, serverApi, useAttachingUploads, useAttachRequests, useRemoveFile, type AttachFilesApi } from "./attached-files";
import { asDropped } from "./dropped-files";
import { UploadList } from "./file-uploader";
import { PageBatchList } from "./page-batch-list";
import { PageFileRow, PageHtmlRow, RefusedRow, type PageHtmlFile } from "./page-file-rows";
import { serverPageFilesApi, type PageFilesApi } from "./page-files-api";
import { usePageBatch } from "./use-page-batch";
import { usePageFilesIntake } from "./use-page-files-intake";
import { useReplaceFile } from "./use-replace-file";
import { FromZips, UnpackingZip } from "./zip-notes";

type PageFile = FileDto & { pagePath: string };

function isPageFile(file: FileDto): file is PageFile {
  return file.pagePath !== undefined;
}

/** Removes one page file through the publish, so it is one version like any change to the page's files. */
function useRemovePageFile(artifactId: string, api: PageFilesApi, onUpdated: (artifact: ArtifactDto) => void) {
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = useCallback(async (file: PageFile) => {
    setRemoving(file.id);
    try {
      const result = await api.publish({ artifactId, uploadIds: [], remove: [file.pagePath] });
      if (!result.success) { toast.error(result.error); return; }
      onUpdated(result.data.artifact);
      toast.success(publishedWords(result.data));
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }, [api, artifactId, onUpdated]);
  return { removing, remove };
}

/** Uses a dropped index.html as the page's content, after a confirm that names what is replaced. */
function useUseAsPage(onUseAsPage: (html: string) => void, setPage: (page: PageHtmlFile | null) => void) {
  const confirm = useConfirm("usePageHtml");
  const [asking, setAsking] = useState<PageHtmlFile | null>(null);
  const use = (entry: PageHtmlFile) => {
    setAsking(entry);
    confirm.request(async () => {
      const text = await entry.file.text().catch(() => null);
      const problem = text === null ? "The file could not be read. Drop it again." : htmlProblem(text);
      if (problem !== null || text === null) { setPage({ ...entry, problem: problem ?? "The file could not be read." }); return true; }
      onUseAsPage(text);
      setPage(null);
      toast.success(`The page now uses ${entry.file.name}. The HTML it had stays in History.`);
      return true;
    });
  };
  return { use, asking, dialog: confirm.dialog };
}

/** The hidden pickers: files, a folder (where the browser allows it), and one file to replace a page file or an attachment. */
function usePickers(onPicked: (files: File[]) => void) {
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const take = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length > 0) onPicked(picked);
  };
  const inputs = (
    <>
      {/* Any type: each file goes where its type belongs, and one that cannot go anywhere says why. */}
      <input ref={filesRef} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden data-slot="add-files-input" onChange={take} />
      <input ref={(element) => { folderRef.current = element; if (element) element.webkitdirectory = true; }} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden data-slot="add-folder-input" onChange={take} />
    </>
  );
  return { inputs, pickFiles: () => { filesRef.current?.click(); }, pickFolder: () => { folderRef.current?.click(); } };
}

/** The one picker for Replace: a new file at a page file's path, or in place of an attachment. */
function useReplacePicker(onPage: (path: string, file: File) => void, onPlain: (target: FileDto, file: File) => void) {
  const target = useRef<FileDto | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      data-slot="replace-file-input"
      onChange={(event) => {
        const [picked] = Array.from(event.target.files ?? []);
        event.target.value = "";
        const file = target.current;
        if (!picked || !file) return;
        if (isPageFile(file)) onPage(file.pagePath, picked);
        else onPlain(file, picked);
      }}
    />
  );
  return { input, pick: (file: FileDto) => { target.current = file; ref.current?.click(); } };
}

interface PageFilesSectionProps {
  artifact: ArtifactDto;
  /** The files the page lists (looseFiles): its page files and the attachments shown nowhere else. */
  files: readonly FileDto[];
  onUpdated: (artifact: ArtifactDto) => void;
  /** Where files go: the server actions unless a fixture hands its own. */
  api?: AttachFilesApi | undefined;
  /** Puts new HTML into the editor as the page's content; the normal save files it as a version. */
  onUseAsPage: (html: string) => void;
  column?: string | undefined;
  className?: string | undefined;
  /** True while files are held over the page. */
  dragging: boolean;
}

/** Everything the section holds: the set on its way in, the plain uploads, what a drop left beside them, and the row actions. */
function useSection({ artifact, files, onUpdated, api = serverApi, onUseAsPage }: PageFilesSectionProps) {
  const pageApi = api.page ?? serverPageFilesApi;
  const held = useMemo<HeldPageFile[]>(() => artifact.files.flatMap((file) => (file.pagePath === undefined ? [] : [{ id: file.id, pagePath: file.pagePath, size: file.size }])), [artifact.files]);
  const batch = usePageBatch({ artifactId: artifact.id, held, api: pageApi, onUpdated });
  const uploads = useAttachingUploads(artifact.id, api, onUpdated);
  const intake = usePageFilesIntake(batch, uploads.addFiles, pageApi.readZip);
  const pickers = usePickers((picked) => { intake.take(picked.map(asDropped)); });
  const plainReplace = useReplaceFile({ artifactId: artifact.id, api, onUpdated });
  const replacer = useReplacePicker(intake.replaceAt, (target, picked) => void plainReplace.replace(target, picked));
  useAttachRequests(artifact.id, true, intake.take, pickers.pickFiles);
  useLeaveGuard(batch.busy || uploads.busy);
  return {
    held,
    pageFiles: inPathOrder(files.filter(isPageFile)),
    attachments: files.filter((file) => !isPageFile(file)),
    batch,
    uploads,
    intake,
    pickers,
    plainReplace,
    replacer,
    plainRemove: useRemoveFile(onUpdated),
    pageRemove: useRemovePageFile(artifact.id, pageApi, onUpdated),
    usePage: useUseAsPage(onUseAsPage, intake.setPage),
  };
}

type Section = ReturnType<typeof useSection>;

/** True when the section has nothing to show: it then draws only its pickers, so "Add files" and a drop still have somewhere to go. */
function showsNothing(section: Section, files: readonly FileDto[], dragging: boolean): boolean {
  const { notes } = section.intake;
  const noNotes = notes.refused.length === 0 && notes.page === null && notes.leftOut === 0 && notes.sources.length === 0 && section.intake.unpacking === null;
  return files.length === 0 && section.batch.rows.length === 0 && section.uploads.items.length === 0 && noNotes && !dragging;
}

/** Files of a drop that were not added: the page itself, with its one action, and refused files with their reasons. */
function NotAdded({ section }: { section: Section }) {
  const { notes } = section.intake;
  const { page } = notes;
  if (!page && notes.refused.length === 0) return null;
  return (
    <ul className="flex min-w-0 flex-col gap-2" aria-label="Not added">
      {page ? <PageHtmlRow entry={page} busy={section.usePage.dialog.pending} onUse={() => { section.usePage.use(page); }} onLeaveOut={() => { section.intake.setPage(null); }} /> : null}
      {notes.refused.map((entry) => <RefusedRow key={entry.key} file={entry} onRemove={() => { section.intake.dropRefused(entry.key); }} />)}
    </ul>
  );
}

/** The page's files by path, then the attachments, each with its actions. */
function HeldFiles({ section, artifact }: { section: Section; artifact: ArtifactDto }) {
  const { pageFiles, attachments, pageRemove, plainRemove, plainReplace, replacer, batch } = section;
  return (
    <>
      {pageFiles.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-2" aria-label="Page files">
          {pageFiles.map((file) => <PageFileRow key={file.id} file={file} removing={pageRemove.removing === file.id} busy={batch.publishing} onReplace={() => { replacer.pick(file); }} onRemove={() => void pageRemove.remove(file)} />)}
        </ul>
      ) : null}
      {attachments.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-2" aria-label="Attachments">
          {attachments.map((file) => (
            <AttachedRow key={file.id} file={file} showId={false} kindLabel="Attachment" removing={plainRemove.removing === file.id} replacing={plainReplace.replacing?.fileId === file.id ? plainReplace.replacing : null} busy={plainReplace.replacing !== null} onRemove={() => void plainRemove.remove(file)} onReplace={offersReplace(file, artifact) ? () => { replacer.pick(file); } : null} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

/**
 * The files of a web page (`html`), under its content, for someone who may
 * edit it. One gesture, the right result: a file dropped on the page, or
 * picked with "Add files" or "Add folder", becomes a page file at its path
 * when its type can be one, and a plain attachment otherwise. A set of page
 * files goes in through the batch tools' path as one publish and one
 * version (usePageBatch). The page's files are listed by path with Copy
 * path, Open, Replace, and Remove, with the room they use against the
 * limits; attachments are listed after them.
 */
export function PageFilesSection(props: PageFilesSectionProps) {
  const { files, column, className, dragging } = props;
  const section = useSection(props);
  const { batch, uploads, pickers, usePage } = section;
  const hidden = <>{pickers.inputs}{section.replacer.input}</>;
  if (showsNothing(section, files, dragging)) return hidden;
  const leftOut = leftOutWords(section.intake.notes.leftOut);
  const actions = (
    <>
      <Button type="button" variant="ghost" size="xs" onClick={pickers.pickFiles}><IconPaperclip aria-hidden /> {ADD_FILES_LABEL}</Button>
      <Button type="button" variant="ghost" size="xs" onClick={pickers.pickFolder}><IconFolderPlus aria-hidden /> Add folder</Button>
    </>
  );
  return (
    <FilesFrame quiet={{ files, dragging }} heading="Files" hint={dropHint("html")} column={column} className={className} count={looseFilesWords(files)} actions={actions}>
      {section.pageFiles.length > 0 || batch.rows.length > 0 ? <p className="text-xs text-muted-foreground" data-slot="page-files-room">{pageFilesTotalsWords(section.held)}</p> : null}
      <UnpackingZip unpacking={section.intake.unpacking} onCancel={section.intake.cancelUnpacking} />
      <FromZips sources={section.intake.notes.sources} onAttach={section.intake.attachZip} />
      <PageBatchList batch={batch} held={section.held} />
      <NotAdded section={section} />
      {leftOut ? <p className="text-xs text-muted-foreground" data-slot="page-files-left-out">{leftOut}</p> : null}
      <HeldFiles section={section} artifact={props.artifact} />
      <UploadList items={uploads.items} onRemove={(itemKey) => { uploads.remove(itemKey); }} />
      {hidden}
      <ConfirmDialog
        state={usePage.dialog}
        title={`Use ${usePage.asking?.file.name ?? "index.html"} as this page's HTML?`}
        description={`The page's HTML is replaced with the ${formatBytes(usePage.asking?.file.size ?? 0)} file you dropped. The HTML it has now stays in History, so you can bring it back.`}
        confirmLabel="Use as this page's HTML"
      />
    </FilesFrame>
  );
}
