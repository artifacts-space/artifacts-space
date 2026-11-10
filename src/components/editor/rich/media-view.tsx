"use client";

import { IconTrash } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";

import { MediaBlock, MediaNotice } from "@/components/artifact-view/media-block";
import { Button } from "@/components/ui/button";
import { clampMediaWidth, hasAdjustableWidth, mediaKindForType, parseFileMediaUrl, type MediaKind } from "@/lib/files/media-rules";
import { cn } from "@/lib/utils";

import { useEditorMedia } from "./media-context";
import { MEDIA_NODE, mediaFileId, readMediaAttrs, type MediaAttrs } from "./media-markdown";
import { MediaPicker, UploadingMedia } from "./media-picker";
import { forgetUpload, queueUpload, type UploadedMedia } from "./media-uploads";

/**
 * A media block in the editor. Empty, it offers an upload or a link;
 * uploading, it shows progress; with a file, it draws the same MediaBlock
 * as the read view, with a caption field under it, a handle to resize
 * images and video, and a small toolbar (width, alt text, remove) while it
 * is selected. Every change is a node attribute, so it saves as Markdown.
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

function Toolbar({ attrs, onChange, onRemove, onEditAlt }: { attrs: MediaAttrs; onChange: (patch: Patch) => void; onRemove: () => void; onEditAlt: () => void }) {
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
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove" onClick={onRemove}><IconTrash aria-hidden /></Button>
    </div>
  );
}

/** A drag handle on the right edge that sets the width as a share of the text column. Wider screens only; phones always use the full column. */
function ResizeHandle({ editor, onPreview, onCommit }: { editor: Editor; onPreview: (width: number | null) => void; onCommit: (width: number) => void }) {
  const start = useRef<{ left: number; column: number } | null>(null);
  const widthAt = (clientX: number) => (start.current ? clampMediaWidth(((clientX - start.current.left) / start.current.column) * 100) : 100);
  return (
    <div
      aria-hidden
      data-media-resize=""
      onPointerDown={(event) => {
        const figure = event.currentTarget.parentElement;
        if (!figure) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { left: figure.getBoundingClientRect().left, column: editor.view.dom.clientWidth || 1 };
      }}
      onPointerMove={(event) => { if (start.current) onPreview(widthAt(event.clientX)); }}
      onPointerUp={(event) => {
        if (!start.current) return;
        onCommit(widthAt(event.clientX));
        start.current = null;
        onPreview(null);
      }}
      className="absolute top-1/2 right-1 hidden h-12 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full bg-foreground/40 opacity-0 shadow-xs ring-2 ring-background transition-opacity group-hover/media:opacity-100 group-data-[selected]/media:opacity-100 sm:block"
    />
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

function ReadOnlyMedia({ attrs }: { attrs: MediaAttrs }) {
  const media = useEditorMedia();
  const fileId = mediaFileId(attrs) ?? "";
  return <MediaBlock kind={attrs.kind} url={media.urlFor(fileId, false)} downloadUrl={media.urlFor(fileId, true)} alt={attrs.alt} caption={attrs.caption} width={attrs.width} file={null} />;
}

function EditableMedia({ editor, attrs, selected, onChange, onRemove }: { editor: Editor; attrs: MediaAttrs; selected: boolean; onChange: (patch: Patch) => void; onRemove: () => void }) {
  const media = useEditorMedia();
  const [preview, setPreview] = useState<number | null>(null);
  const [altOpen, setAltOpen] = useState(false);
  const fileId = mediaFileId(attrs) ?? "";
  const caption = <TextField value={attrs.caption} label="Caption" placeholder="Add a caption" onChange={(next) => { onChange({ caption: next }); }} />;
  const overlay = hasAdjustableWidth(attrs.kind) ? <ResizeHandle editor={editor} onPreview={setPreview} onCommit={(width) => { onChange({ width }); }} /> : null;
  return (
    <div className="flex flex-col gap-2">
      {selected || altOpen ? <Toolbar attrs={attrs} onChange={onChange} onRemove={onRemove} onEditAlt={() => { setAltOpen((open) => !open); }} /> : null}
      {altOpen ? <AltField attrs={attrs} onChange={onChange} /> : null}
      <MediaBlock kind={attrs.kind} url={media.urlFor(fileId, false)} downloadUrl={media.urlFor(fileId, true)} alt={attrs.alt} caption={caption} width={preview ?? attrs.width} file={null} overlay={overlay} />
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
