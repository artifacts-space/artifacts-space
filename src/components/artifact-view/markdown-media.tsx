"use client";

import { parseFileMediaUrl } from "@/lib/files/media-rules";

import { useArtifactFile } from "./files-context";
import { MediaBlock, MediaNotice } from "./media-block";

/**
 * A media block in a rendered Markdown artifact: `![alt](/api/files/<id>…)`
 * alone in its paragraph (see markdown-dialect.md). The file loads through
 * the access-checked /api/files route. When the page listed the files this
 * reader may open and this one is not among them (removed, or newer than
 * the version they read), a notice shows and nothing is requested.
 */
export function MarkdownMedia({ src, alt, title }: { src: string; alt: string; title: string | null }) {
  const target = parseFileMediaUrl(src);
  const view = useArtifactFile(target?.fileId ?? "");
  if (!target) return null;
  if (!view.attached) return <MediaNotice kind={target.kind}>{alt ? `“${alt}” is not available.` : "This file is not available."}</MediaNotice>;
  return <MediaBlock kind={target.kind} url={view.url} downloadUrl={view.downloadUrl} alt={alt} caption={title} width={target.width} file={view.file} />;
}

/** An uploaded image that shares its paragraph with text: drawn in the text, through the same access-checked route. */
export function InlineFileImage({ src, alt }: { src: string; alt: string }) {
  const target = parseFileMediaUrl(src);
  const view = useArtifactFile(target?.fileId ?? "");
  if (!target || !view.attached) return <span className="text-muted-foreground">[Image{alt ? `: ${alt}` : ""}]</span>;
  // eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize
  return <img src={view.url} alt={alt} loading="lazy" decoding="async" className="inline-block h-auto max-h-[80vh] max-w-full rounded-lg align-middle" />;
}
