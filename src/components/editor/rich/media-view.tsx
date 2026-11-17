"use client";

import { IconArrowsMaximize, IconDownload, IconExternalLink, IconTrash } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";

import { useArtifactFile } from "@/components/artifact-view/files-context";
import { useImageViewer } from "@/components/artifact-view/image-viewer/use-image-viewer";
import { MediaBlock, MediaNotice, OPEN_LARGER_LABEL, type MediaFileFacts } from "@/components/artifact-view/media-block";
import { Button } from "@/components/ui/button";
import { hasAdjustableWidth, mediaKindForType, parseFileMediaUrl, type MediaKind } from "@/lib/files/media-rules";
import { cn } from "@/lib/utils";

import { useEditorMedia } from "./media-context";
import { MEDIA_NODE, mediaFileId, readMediaAttrs, type MediaAttrs } from "./media-markdown";
import { kindCopy, MediaPicker, UploadingMedia } from "./media-picker";
import { ResizeHandles } from "./media-resize";
import { forgetUpload, queueUpload, uploadedFacts, type UploadedMedia } from "./media-uploads";

/**
 * A media block in the editor. Empty, it offers an upload or a link;
 * uploading, it shows progress; with a file, it draws the same MediaBlock
 * as the read view, with a caption field under it, handles on both edges
 * and the corners to resize images and video (media-resize.tsx), and a
 * small toolbar (width, alt text, replace, open larger, open in a new tab,
 * download, remove) while it is selected. A click selects the block, so an
 * image opens larger from the toolbar or with a double-click. Every change
 * is a node attribute, so it saves as Markdown.
 */

type Patch = Partial<MediaAttrs>;

/**
 * Writes the uploaded file into the block without an undo step, so Undo
 * removes the block instead of putting it back to "uploading".
 */
function setQuietly(editor: Editor, getPos: () => number | undefined, patch: Patch) {
  const position = getPos();
  if (position === undefined) return;
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== MEDIA_NODE) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, ...patch }).setMeta("addToHistory", false));
}

const widthChoices: readonly { label: string; width: number | null }[] = [
  { label: "Small", width: 33 },
  { label: "Medium", width: 50 },
  { label: "Large", width: 75 },
  { label: "Full", width: 100 },
  { label: "Original", width: null },
];

interface ToolbarProps {
  attrs: MediaAttrs;
  /** Where the file opens and downloads from. */
  links: { open: string; download: string };
  onChange: (patch: Patch) => void;
  onRemove: () => void;
  onEditAlt: () => void;
  /** Picks a new file for this block. */
  onReplace: () => void;
  /** Images only: opens the image larger in place. */
  onOpenLarger: (() => void) | undefined;
}

function Toolbar({ attrs, links, onChange, onRemove, onEditAlt, onReplace, onOpenLarger }: ToolbarProps) {
  return (
    <div role="toolbar" aria-label="Media options" className="flex flex-wrap items-center gap-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
      {hasAdjustableWidth(attrs.kind)
        ? widthChoices.map((choice) => (
            <Button key={choice.label} type="button" variant="ghost" size="xs" aria-pressed={attrs.width === choice.width} onClick={() => { onChange({ width: choice.width }); }} className={cn(attrs.width === choice.width && "bg-muted text-foreground")}>
              {choice.label}
            </Button>
          ))
        : null}
      <Button type="button" variant="ghost" size="xs" onClick={onEditAlt}>{attrs.kind === "image" ? "Alt text" : "Name"}</Button>
      <Button type="button" variant="ghost" size="xs" onClick={onReplace}>Replace</Button>
      {onOpenLarger ? <Button type="button" variant="ghost" size="icon-xs" aria-label={OPEN_LARGER_LABEL} onClick={onOpenLarger}><IconArrowsMaximize aria-hidden /></Button> : null}
      <Button variant="ghost" size="icon-xs" nativeButton={false} render={<a href={links.open} target="_blank" rel="noopener noreferrer" aria-label="Open in a new tab" />}><IconExternalLink aria-hidden /></Button>
      <Button variant="ghost" size="icon-xs" nativeButton={false} render={<a href={links.download} aria-label="Download" />}><IconDownload aria-hidden /></Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove" onClick={onRemove}><IconTrash aria-hidden /></Button>
    </div>
  );
}

function TextField({ value, label, placeholder, onChange, autoFocus = false, className }: { value: string; label: string; placeholder: string; onChange: (value: string) => void; autoFocus?: boolean; className?: string }) {
  return (
    <input
      value={value}
      aria-label={label}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(event) => { onChange(event.target.value); }}
      className={cn("w-full bg-transparent text-base text-muted-foreground outline-none placeholder:text-muted-foreground/60 md:text-sm", className)}
    />
  );
}

function AltField({ attrs, onChange }: { attrs: MediaAttrs; onChange: (patch: Patch) => void }) {
  const image = attrs.kind === "image";
  return (
    <TextField
      value={attrs.alt}
      label={image ? "Alt text" : "Name"}
      placeholder={image ? "Describe the image for people who cannot see it" : "The name people see"}
      autoFocus
      onChange={(alt) => { onChange({ alt }); }}
      className="rounded-md border bg-background px-2 py-1 text-foreground"
    />
  );
}

/**
 * What the block shows of its file: the artifact's own list when the page
 * gave one (a saved document), else what this tab's upload of it said, so a
 * file dropped a moment ago already has its type, its size, and an image's
 * shape.
 */
function useMediaFile(fileId: string): MediaFileFacts | null {
  const listed = useArtifactFile(fileId).file;
  if (listed) return listed;
  const uploaded = uploadedFacts(fileId);
  if (uploaded?.size === undefined) return null;
  return { ...uploaded, size: uploaded.size };
}

/** The control a reader's image carries: where the focus goes back to when the viewer closes. */
function openControlOf(image: HTMLImageElement): HTMLElement | null {
  return image.parentElement?.querySelector<HTMLElement>(`button[aria-label="${OPEN_LARGER_LABEL}"]`) ?? null;
}

function ReadOnlyMedia({ attrs }: { attrs: MediaAttrs }) {
  const media = useEditorMedia();
  const fileId = mediaFileId(attrs) ?? "";
  const file = useMediaFile(fileId);
  const downloadUrl = media.urlFor(fileId, true);
  const viewer = useImageViewer({ fileId, downloadUrl, enabled: attrs.kind === "image", focusOnClose: openControlOf });
  return <MediaBlock kind={attrs.kind} url={media.urlFor(fileId, false)} downloadUrl={downloadUrl} alt={attrs.alt} caption={attrs.caption} width={attrs.width} file={file} view={{ viewer, trigger: "click" }} />;
}

function EditableMedia({ editor, attrs, selected, onChange, onRemove }: { editor: Editor; attrs: MediaAttrs; selected: boolean; onChange: (patch: Patch) => void; onRemove: () => void }) {
  const media = useEditorMedia();
  const [preview, setPreview] = useState<number | null>(null);
  const [altOpen, setAltOpen] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);
  const fileId = mediaFileId(attrs) ?? "";
  const file = useMediaFile(fileId);
  const links = { open: media.urlFor(fileId, false), download: media.urlFor(fileId, true) };
  const image = attrs.kind === "image";
  const viewer = useImageViewer({ fileId, downloadUrl: links.download, enabled: image });
  // The block keeps its place, caption, alt text, and width; the new file uploads in it. One step, so Undo brings the old file back.
  const replaceWith = (file: File | undefined) => { if (file) onChange({ src: "", uploadId: queueUpload(file) }); };
  const caption = <TextField value={attrs.caption} label="Caption" placeholder="Add a caption" onChange={(next) => { onChange({ caption: next }); }} />;
  const overlay = hasAdjustableWidth(attrs.kind) ? <ResizeHandles editor={editor} width={attrs.width} selected={selected} onPreview={setPreview} onCommit={(width) => { onChange({ width }); }} /> : null;
  return (
    <div className="flex flex-col gap-2">
      {selected || altOpen ? <Toolbar attrs={attrs} links={links} onChange={onChange} onRemove={onRemove} onEditAlt={() => { setAltOpen((open) => !open); }} onReplace={() => { replaceRef.current?.click(); }} onOpenLarger={image ? viewer.show : undefined} /> : null}
      <input ref={replaceRef} type="file" accept={kindCopy[attrs.kind].accept} hidden aria-label="Replace: choose a file" onChange={(event) => { replaceWith(event.target.files?.[0]); event.target.value = ""; }} />
      {altOpen ? <AltField attrs={attrs} onChange={onChange} /> : null}
      <MediaBlock kind={attrs.kind} url={links.open} downloadUrl={links.download} alt={attrs.alt} caption={caption} width={preview ?? attrs.width} file={file} overlay={overlay} view={{ viewer, trigger: "double-click" }} />
    </div>
  );
}

/** See the notes at the top of this file. */
export function MediaView({ node, editor, selected, getPos, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const attrs = readMediaAttrs(node.attrs);
  const onChange = useCallback((patch: Patch) => { updateAttributes(patch); }, [updateAttributes]);
  const onDone = useCallback((file: UploadedMedia) => {
    if (attrs.uploadId) forgetUpload(attrs.uploadId);
    const kind: MediaKind = mediaKindForType(file.contentType);
    setQuietly(editor, getPos, { src: `/api/files/${file.id}`, kind, uploadId: null });
  }, [attrs.uploadId, editor, getPos]);
  const onRemove = useCallback(() => {
    if (attrs.uploadId) forgetUpload(attrs.uploadId);
    deleteNode();
  }, [attrs.uploadId, deleteNode]);

  return (
    <NodeViewWrapper className="rich-media group/media relative" data-selected={selected ? "" : undefined} data-media-block={attrs.kind}>
      <div contentEditable={false} className="flex flex-col">
        <MediaContent editor={editor} attrs={attrs} selected={selected} onChange={onChange} onDone={onDone} onRemove={onRemove} />
      </div>
    </NodeViewWrapper>
  );
}

/** A link to one of this site's uploads, as attributes: its own kind and width when it names them, else the picker's kind. */
function sourcePatch(src: string, pickerKind: MediaKind): Patch {
  const target = parseFileMediaUrl(src);
  if (!target) return {};
  const named = src.includes("#");
  return { src: `/api/files/${target.fileId}`, kind: named ? target.kind : pickerKind, width: target.width };
}

function MediaContent({ editor, attrs, selected, onChange, onDone, onRemove }: { editor: Editor; attrs: MediaAttrs; selected: boolean; onChange: (patch: Patch) => void; onDone: (file: UploadedMedia) => void; onRemove: () => void }) {
  if (attrs.uploadId && !attrs.src) return <UploadingMedia uploadId={attrs.uploadId} kind={attrs.kind} onDone={onDone} onRemove={onRemove} />;
  if (!attrs.src) {
    if (!editor.isEditable) return null;
    return <MediaPicker kind={attrs.kind} onFile={(file) => { onChange({ uploadId: queueUpload(file) }); }} onSource={(src) => { onChange(sourcePatch(src, attrs.kind)); }} onRemove={onRemove} />;
  }
  if (!mediaFileId(attrs)) {
    return <MediaNotice kind="image">{attrs.alt ? `“${attrs.alt}”: images` : "Images"} from other sites do not load here, so they cannot track readers. Upload the image instead.</MediaNotice>;
  }
  if (!editor.isEditable) return <ReadOnlyMedia attrs={attrs} />;
  return <EditableMedia editor={editor} attrs={attrs} selected={selected} onChange={onChange} onRemove={onRemove} />;
}
