"use client";

import { parseFileMediaUrl, shownMediaKind, type FileMediaTarget } from "@/lib/files/media-rules";

import { useArtifactFile } from "./files-context";
import { useImageViewer } from "./image-viewer/use-image-viewer";
import { MediaBlock, MediaNotice, OPEN_LARGER_LABEL } from "./media-block";

/** The control beside an image that opens it larger: where the focus goes back to when the viewer closes. */
function openControlOf(image: HTMLImageElement): HTMLElement | null {
  return image.parentElement?.querySelector<HTMLElement>(`button[aria-label="${OPEN_LARGER_LABEL}"]`) ?? null;
}

/**
 * A media block in a rendered Markdown artifact: `![alt](/api/files/<id>…)`
 * alone in its paragraph (see markdown-dialect.md). The file loads through
 * the access-checked /api/files route. When the page listed the files this
 * reader may open and this one is not among them (removed, or newer than
 * the version they read), a notice shows and nothing is requested. An image
 * opens larger in place with a click, or with the control on it.
 */
export function MarkdownMedia({ src, alt, title }: { src: string; alt: string; title: string | null }) {
  const target = parseFileMediaUrl(src);
  return target ? <FileMedia src={src} target={target} alt={alt} title={title} /> : null;
}

function FileMedia({ src, target, alt, title }: { src: string; target: FileMediaTarget; alt: string; title: string | null }) {
  const view = useArtifactFile(target.fileId);
  // A link without a kind (`![clip](/api/files/<id>)`) shows as its file's type does: a video plays, a PDF opens.
  const kind = shownMediaKind(src, view.file?.contentType) ?? target.kind;
  const viewer = useImageViewer({ fileId: target.fileId, downloadUrl: view.downloadUrl, enabled: kind === "image" && view.attached, focusOnClose: openControlOf });
  if (!view.attached) return <MediaNotice kind={kind}>{alt ? `“${alt}” is not available.` : "This file is not available."}</MediaNotice>;
  return <MediaBlock kind={kind} url={view.url} downloadUrl={view.downloadUrl} alt={alt} caption={title} width={target.width} file={view.file} view={{ viewer, trigger: "click" }} />;
}

/** An uploaded image that shares its paragraph with text: drawn in the text, through the same access-checked route. A click opens it larger. */
export function InlineFileImage({ src, alt }: { src: string; alt: string }) {
  const target = parseFileMediaUrl(src);
  const view = useArtifactFile(target?.fileId ?? "");
  const viewer = useImageViewer({ fileId: target?.fileId ?? "", downloadUrl: view.downloadUrl, enabled: target !== null && view.attached });
  if (!target || !view.attached) return <span className="text-muted-foreground">[Image{alt ? `: ${alt}` : ""}]</span>;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize */}
      <img src={view.url} alt={alt} loading="lazy" decoding="async" {...viewer.marks} onClick={viewer.show} className="inline-block h-auto max-h-[80vh] max-w-full cursor-zoom-in rounded-lg align-middle" />
      {viewer.dialog}
    </>
  );
}
