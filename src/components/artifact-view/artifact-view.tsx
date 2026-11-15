/**
 * ArtifactView renders artifact content by format. Use it anywhere an artifact
 * is shown: the public artifact page, the workspace editor preview, and the
 * component gallery.
 *
 * Import: `import { ArtifactView } from "@/components/artifact-view/artifact-view";`
 *
 * Props:
 * - `kind`     (string, required): the artifact format, such as "markdown",
 *              "code", "text", "json", "csv", "svg", "mermaid", "ui", or
 *              "canvas".
 *              An unknown kind renders as plain text.
 * - `content`  (string, required): the artifact content, exactly as stored.
 * - `title`    (string, optional): the artifact title. Used as the alt text of
 *              SVG images. Defaults to "Artifact image".
 * - `language` (string, optional): the code language label for `code`.
 * - `files`    (FileDto[], optional): the artifact's ready files. Required to
 *              show a `file` artifact's files; Image and File elements in a
 *              ui artifact or a canvas frame use it for names and sizes.
 * - `className` (string, optional): extra classes on the outer wrapper.
 *
 * It has no "use client" directive, so it renders on the server when used in
 * a server component. Markdown, code, text, JSON, CSV, and SVG render fully on
 * the server. Mermaid, ui, and canvas are client components; they server-render
 * their shell, and Mermaid loads only in the browser when a diagram is on screen.
 * No content runs code: SVG and Mermaid show through <img>, Markdown skips raw
 * HTML, and links allow only http, https, and mailto.
 */
import type { ReactNode } from "react";

import type { FormatKind } from "@/lib/artifact-formats";
import type { FileDto } from "@/lib/files/types";
import { cn } from "@/lib/utils";

import { FileArtifactView } from "./file-artifact-view";
import { CanvasView } from "./canvas-view";
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

/** How each format's content is drawn. A kind missing here (one this build does not know) shows as plain text. */
const formatBodies: Record<FormatKind, (props: ArtifactViewProps) => ReactNode> = {
  markdown: ({ content }) => <MarkdownView content={content} media diagrams />,
  code: ({ content, language }) => <CodeView content={content} language={language} />,
  text: ({ content }) => <TextView content={content} />,
  json: ({ content }) => <JsonView content={content} />,
  csv: ({ content }) => <CsvView content={content} />,
  svg: ({ content, title }) => <SvgView content={content} title={title ?? "Artifact image"} />,
  mermaid: ({ content }) => <MermaidView code={content} />,
  ui: ({ content }) => <UiView content={content} />,
  canvas: ({ content }) => <CanvasView content={content} />,
  file: ({ content }) => <FileArtifactView notes={content} />,
};

function FormatBody(props: ArtifactViewProps) {
  const body = Object.hasOwn(formatBodies, props.kind) ? formatBodies[props.kind as FormatKind] : formatBodies.text;
  return body(props);
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
