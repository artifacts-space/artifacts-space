"use client";

import { fileTypeLabel } from "@/lib/files/config";
import type { UiProps } from "@/lib/ui/catalog";
import { cn } from "@/lib/utils";

import { FileCard } from "../file-card";
import { useArtifactFile } from "../files-context";

import { radiusClass, ratioClass } from "./scales";
import { ElementNotice, type ViewProps } from "./stout";

/** At its natural size, capped by the page; with a `ratio`, the full width cropped to that shape, or fitted inside it. */
function imageClass(props: UiProps<"Image">): string {
  const shape = props.ratio ? cn("w-full", ratioClass[props.ratio], props.fit === "contain" ? "object-contain" : "object-cover") : "h-auto max-h-[70vh] max-w-full object-contain";
  return cn("border bg-muted shadow-xs", shape, radiusClass[props.radius ?? "md"]);
}

/** An uploaded image, by file id. Never a URL. */
export function ImageView({ props }: ViewProps<"Image">) {
  const { attached, url, eager } = useArtifactFile(props.file);
  if (!attached) return <ElementNotice type="Image" detail="Its file is not attached to this artifact." />;
  return (
    <figure className={cn("flex min-w-0 flex-col items-start gap-2", props.ratio && "w-full")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize */}
      <img src={url} alt={props.alt} loading={eager ? "eager" : "lazy"} decoding="async" className={imageClass(props)} />
      {props.caption ? <figcaption className="text-sm leading-5 text-muted-foreground">{props.caption}</figcaption> : null}
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
