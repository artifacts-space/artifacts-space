/**
 * ArtifactView renders artifact content by format. Use it anywhere an artifact
 * is shown: the public artifact page, the workspace editor preview, and the
 * component gallery.
 *
 * Import: `import { ArtifactView } from "@/components/artifact-view/artifact-view";`
 *
 * Props:
 * - `kind`     (string, required): the artifact format, such as "markdown",
 *              "code", "text", "json", "csv", "svg", "mermaid", or "ui".
 *              An unknown kind renders as plain text.
 * - `content`  (string, required): the artifact content, exactly as stored.
 * - `title`    (string, optional): the artifact title. Used as the alt text of
 *              SVG images. Defaults to "Artifact image".
 * - `language` (string, optional): the code language label for `code`.
 * - `files`    (FileDto[], optional): the artifact's ready files. Required to
 *              show a `file` artifact's files; Image and File elements in a
 *              ui artifact use it for names and sizes.
 * - `className` (string, optional): extra classes on the outer wrapper.
 *
 * It has no "use client" directive, so it renders on the server when used in
 * a server component. Markdown, code, text, JSON, CSV, and SVG render fully on
 * the server. Mermaid and ui are client components; they server-render their
 * shell, and Mermaid loads only in the browser when a diagram is on screen.
 * No content runs code: SVG and Mermaid show through <img>, Markdown skips raw
 * HTML, and links allow only http, https, and mailto.
 */
import type { FormatKind } from "@/lib/artifact-formats";
import type { FileDto } from "@/lib/files/types";
import { cn } from "@/lib/utils";

import { FileArtifactView } from "./file-artifact-view";
import { ArtifactFilesProvider } from "./files-context";
import { MarkdownView } from "./markdown-view";
import { MermaidView } from "./mermaid-view";
import { CsvView } from "./csv-view";
import { CodeView, JsonView, SvgView, TextView } from "./source-views";
import { UiView } from "./ui-view";
import { ViewNotice } from "./view-notice";

export interface ArtifactViewProps {
  kind: FormatKind | (string & {});
  content: string;
  title?: string | undefined;
  language?: string | undefined;
  files?: readonly FileDto[] | undefined;
  className?: string | undefined;
}

function FormatBody({ kind, content, title, language }: ArtifactViewProps) {
  switch (kind) {
    case "markdown":
      return <MarkdownView content={content} media />;
    case "code":
      return <CodeView content={content} language={language} />;
    case "json":
      return <JsonView content={content} />;
    case "csv":
      return <CsvView content={content} />;
    case "svg":
      return <SvgView content={content} title={title ?? "Artifact image"} />;
    case "mermaid":
      return <MermaidView code={content} />;
    case "ui":
      return <UiView content={content} />;
    case "file":
      return <FileArtifactView notes={content} />;
    default:
      return <TextView content={content} />;
  }
}

/** Renders artifact content by its format. See the props documented at the top of this file. */
export function ArtifactView(props: ArtifactViewProps) {
  const body = props.content.trim() === "" && props.kind !== "file" ? <ViewNotice title="This artifact is empty." /> : <FormatBody {...props} />;
  return (
    <div className={cn("min-w-0", props.className)} data-artifact-kind={props.kind}>
      {props.files ? <ArtifactFilesProvider files={props.files}>{body}</ArtifactFilesProvider> : body}
    </div>
  );
}
