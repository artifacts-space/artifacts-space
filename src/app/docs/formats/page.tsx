import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { DocsH, FactTable, InlineCodeText, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { formatInfo, formatKinds, type FormatKind } from "@/lib/artifact-formats";
import { artifactSizeLimits } from "@/lib/artifact-limits";
import { formatDocs, formatErrorMessage } from "@/lib/docs/format-docs";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { allowedFileTypes, fileLimits, formatBytes } from "@/lib/files/config";
import { maxMermaidLength } from "@/lib/mermaid-source";
import { uiLimits } from "@/lib/ui/limits";

export const metadata = docsMetadata("formats");

const page = "formats" as const;

/** The code block language for each kind's example. Kinds without a grammar show as plain text. */
const exampleLanguage: Record<FormatKind, string> = {
  markdown: "markdown",
  code: "typescript",
  text: "text",
  json: "json",
  csv: "csv",
  svg: "svg",
  mermaid: "mermaid",
  ui: "json",
  file: "text",
};

/** Exact bytes, with a short form for people. */
const size = (bytes: number) => `${bytes.toLocaleString("en-US")} bytes (${formatBytes(bytes)})`;

const fileTypeRows = Object.entries(allowedFileTypes).map(([type, info]) => [
  type,
  info.extensions.map((extension) => `.${extension}`).join(" "),
  info.label,
  info.category,
]);

function FormatSection({ kind }: { kind: FormatKind }) {
  const doc = formatDocs[kind];
  const error = formatErrorMessage(kind);
  return (
    <>
      <DocsH page={page} id={kind} />
      <Prose>
        <p><InlineCodeText text={formatInfo[kind].agent} /></p>
      </Prose>
      <FactTable
        head={["", ""]}
        rows={[
          ["kind", kind],
          ["Saves when", <InlineCodeText key="checks" text={doc.checks} />],
          ["Shows as", <InlineCodeText key="renders" text={doc.renders} />],
        ]}
      />
      <CodeSnippet title="Example content" language={exampleLanguage[kind]} code={doc.example} className="mt-4" />
      {error ? <CodeSnippet title="Refused content, and the real message" code={`${doc.broken ?? ""}\n\n→ ${error}`} wrap className="mt-4" /> : null}
    </>
  );
}

/** The nine formats, with limits and checks read from the code. */
export default function FormatsPage() {
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="overview" />
      <Prose>
        <p>Every artifact has one <code>kind</code>. It decides how the content is checked when it is saved and how the page shows it. Pick the simplest kind that fits: Markdown for prose, <code>ui</code> when the reader needs a dashboard or a report, <code>file</code> for anything uploaded.</p>
      </Prose>
      <FactTable
        head={["kind", "Name", "For"]}
        rows={formatKinds.map((kind) => [<a key={kind} href={`#${kind}`} className="underline-offset-4 hover:underline">{kind}</a>, formatInfo[kind].label, formatInfo[kind].helper])}
        mono={[0]}
      />
      <Prose>
        <p>Content is checked on every save, from MCP and the web app alike. Agents can check it first, without saving, with <Link href={`${docsHref("mcp")}#artifacts_validate`}><code>artifacts_validate</code></Link>. Changing the kind of an existing artifact checks the stored content against the new kind.</p>
        <p>Every format can also have a theme, which sets the colors and fonts of the artifact and its page. See <Link href={docsHref("themes")}>Themes</Link>.</p>
      </Prose>

      <DocsH page={page} id="limits" />
      <FactTable
        head={["Limit", "Value", "Applies to"]}
        rows={[
          ["Content", size(artifactSizeLimits.maxContentBytes), "Every kind, in UTF-8 bytes. Split larger work into several artifacts."],
          ["Metadata", size(artifactSizeLimits.maxMetadataBytes), "The metadata object, as JSON text."],
          ["ui spec", size(uiLimits.maxSpecBytes), "ui content, plus element and depth limits."],
          ["Mermaid source", `${maxMermaidLength.toLocaleString("en-US")} characters`, "mermaid content."],
          ["File", size(fileLimits.maxBytes), `Each upload. Up to ${String(fileLimits.maxFilesPerArtifact)} files per artifact.`],
        ]}
        mono={[1]}
      />
      <Note>
        The full list, with rate limits and storage quotas, is on <Link href={docsHref("limits")} className="underline underline-offset-2">Limits and quotas</Link>. The ui limits are on <Link href={docsHref("json-render/validation", "limits")} className="underline underline-offset-2">Validation</Link>.
      </Note>

      {formatKinds.map((kind) => <FormatSection key={kind} kind={kind} />)}

      <Prose>
        <p>Allowed file types. Anything else is refused. A vague type such as <code>application/octet-stream</code> is decided by the extension.</p>
      </Prose>
      <FactTable head={["Content type", "Extensions", "Name", "Shown as"]} rows={fileTypeRows} mono={[0, 1]} />
      <Prose>
        <p>Uploading takes three calls: <code>files_request_upload</code>, a PUT to the presigned URL (valid {fileLimits.uploadUrlSeconds / 60} minutes), then <code>files_finalize</code>, which checks the size and type. Then <code>files_create_artifact</code> makes a file artifact, or <code>files_attach</code> adds the files to an existing one, such as a ui artifact that shows them with Image and File. <code>files_replace</code> puts a new upload in place of a file already there: it keeps its id, place, and name, so links open the new file, and the old copy stays in History for people who can edit. Unfinished uploads are deleted after {fileLimits.pendingTtlMs / 3_600_000} hour, and finished files never attached after {fileLimits.unattachedTtlMs / 3_600_000} hours. See the <Link href={`${docsHref("mcp")}#tools-files`}>Files tools</Link>.</p>
      </Prose>
    </RegistryPage>
  );
}
