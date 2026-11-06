"use client";

import { fileTypeLabel } from "@/lib/files/config";

import { FileCard } from "../file-card";
import { useArtifactFile } from "../files-context";

import { ElementNotice, type ViewProps } from "./stout";

/** An uploaded image, by file id. Never a URL. */
export function ImageView({ props }: ViewProps<"Image">) {
  const { attached, url } = useArtifactFile(props.file);
  if (!attached) return <ElementNotice type="Image" detail="Its file is not attached to this artifact." />;
  return (
    <figure className="flex min-w-0 flex-col items-start gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize */}
      <img src={url} alt={props.alt} loading="lazy" decoding="async" className="h-auto max-h-[70vh] max-w-full rounded-md border bg-muted object-contain" />
      {props.caption ? <figcaption className="text-xs leading-5 text-muted-foreground">{props.caption}</figcaption> : null}
    </figure>
  );
}

/** A download card for an uploaded file, by file id. */
export function FileView({ props }: ViewProps<"File">) {
  const { file, attached, downloadUrl } = useArtifactFile(props.file);
  if (!attached) return <ElementNotice type="File" detail="Its file is not attached to this artifact." />;
  const name = props.label ?? file?.filename ?? "Download file";
  return <FileCard name={name} detail={file ? fileTypeLabel(file.contentType) : null} size={file?.size ?? null} href={downloadUrl} />;
}
