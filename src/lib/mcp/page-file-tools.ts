import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { BadBaseVersionError } from "@/lib/edits/conflict-error";
import { parseBaseVersion } from "@/lib/edits/edit-conflict-rules";
import { getEditableArtifact } from "@/lib/access";
import { fileLimits, formatBytes } from "@/lib/files/config";
import { publishPageFiles } from "@/lib/page-files/publish";
import { pageBatchLimits } from "@/lib/page-files/publish-rules";
import { requestPageUploads } from "@/lib/page-files/request-uploads";
import { pageFileLimits, pageFileTypesHint } from "@/lib/page-files/rules";
import type { McpAccess } from "@/lib/oauth/scopes";
import { UserFacingError } from "@/lib/user-facing-error";

import { ARTIFACT_REF_WORDS, artifactRefField } from "./artifact-ref-field";
import { withConflictResult } from "./edit-conflict-tools";
import { artifactResult, asReplaced, editableArtifact, respond } from "./file-tools";
import { noHarness, type HarnessSource } from "./harness-context";
import { gateTools, type ToolServer } from "./tool-access";

/*
 * Many page files in few calls. A site of 30 files costs one call that
 * starts every upload (page_files_request_uploads), the PUTs, and one call
 * that checks every upload and brings the page's files to the new state
 * together, with one version (page_files_publish). The single-file tools
 * (files_request_upload, files_finalize, files_attach, files_replace,
 * files_delete) stay for one or two files.
 */

/** Which artifact: the shared field every tool uses, so a link works here too. */
const artifactField = (userId: string) => artifactRefField(userId, `An HTML artifact (kind "html") you can edit: ${ARTIFACT_REF_WORDS}`);
const pathField = z.string().min(1).max(pageFileLimits.maxPathLength);
const removeField = z.array(pathField).max(pageBatchLimits.maxFilesPerPublish).optional();

/** How a site of several pages is made, in the words the guide uses (buildHtmlGuide). */
const siteNote = "A site of several pages: index.html is the artifact's content; every other page is a page file whose path ends in .html (about.html, docs/guide.html), linked with ordinary relative links such as <a href=\"about.html\">, and it opens in the same frame under the same rules as the first page.";

const limitsNote = `A page file may be ${pageFileTypesHint}, up to ${formatBytes(fileLimits.maxBytes)} each. One artifact holds at most ${String(pageFileLimits.maxFiles)} page files, ${formatBytes(pageFileLimits.maxTotalBytes)} in all.`;

/** A shell loop over the saved result that PUTs every file from the folder the paths are relative to. */
const putLoop = `jq -r '.uploads[] | [.path, .headers["Content-Type"], .url] | @tsv' uploads.json | while IFS=$'\\t' read -r path type url; do curl -sf -X PUT -H "Content-Type: $type" --data-binary "@$path" "$url" || echo "failed: $path"; done`;

function registerRequestUploads(server: ToolServer, userId: string) {
  server.registerTool(
    "page_files_request_uploads",
    {
      title: "Start the uploads of a page's files",
      description: `Starts the uploads of many page files of an HTML artifact in one call: the stylesheets, scripts, images, fonts, and data its page loads by relative path, such as <link rel="stylesheet" href="css/site.css">. Name every file by its path and exact size, up to ${String(pageBatchLimits.maxUploadsPerRequest)} in a call; for a larger site, call again for the rest and publish them all together. The whole set is checked before any upload starts: each path and type, and the page's limits as the set would leave it. If anything is wrong, nothing is started and one refusal names every file to fix. The result gives, for each file, its path, a fileId, a PUT url, and the headers to send. PUT each file's bytes (the urls work for ${String(fileLimits.uploadUrlSeconds / 60)} minutes), then call page_files_publish once with the fileIds. A path the page already has is fine: publishing replaces that file. ${siteNote} ${limitsNote} Paths match letter for letter, so prefer lowercase.`,
      inputSchema: {
        artifact: artifactField(userId),
        files: z
          .array(z.object({
            path: pathField.describe('The relative path the page loads the file by, such as "css/site.css", "img/logo.png", or "about.html" for another page: folders and a file name of letters, digits, dots, dashes, and underscores, joined by /. The type comes from the extension.'),
            size: z.number().int().positive().describe("Exact size in bytes. The PUT must send exactly this many bytes."),
          }))
          .min(1)
          .max(pageBatchLimits.maxUploadsPerRequest)
          .describe("Every file of the set, each path once"),
        remove: removeField.describe("Paths of page files the same publish will remove. Naming them here only makes room in the limits for this set; nothing is removed until page_files_publish."),
      },
    },
    ({ artifact, files, remove }) => respond(async () => {
      const record = await editableArtifact(userId, artifact);
      const started = await requestPageUploads(userId, { artifact: record, files, remove: remove ?? [] });
      const expiresAt = started.reduce<Date | null>((earliest, upload) => (earliest === null || upload.upload.expiresAt < earliest ? upload.upload.expiresAt : earliest), null);
      return {
        artifact,
        uploads: started.map(({ path, fileId, size, upload }) => ({ path, fileId, size, url: upload.url, headers: upload.headers })),
        fileIds: started.map((upload) => upload.fileId),
        expiresAt: expiresAt?.toISOString() ?? null,
        put: `PUT each file's bytes to its url with exactly its headers: curl -sf -X PUT -H "Content-Type: <headers.Content-Type>" --data-binary @<path> "<url>" (curl sets Content-Length). To send them all, save this result as uploads.json and run this from the folder the paths are relative to: ${putLoop}`,
        next: `After every PUT succeeds, call page_files_publish once with artifact "${artifact}" and uploads set to fileIds${remove && remove.length > 0 ? ", and the same remove list" : ""}. It checks each upload and publishes them together.`,
      };
    }),
  );
}

const baseVersionNote =
  "Optional. The `baseVersion` you got with the artifact (artifacts_get, or the result of your last save). With it, the publish is refused, and nothing changes, if the artifact was saved since you read it: read it again with artifacts_get and publish with the new baseVersion.";

function registerPublish(server: ToolServer, userId: string, harness: HarnessSource) {
  server.registerTool(
    "page_files_publish",
    {
      title: "Publish a page's files",
      description: `Brings the page files of an HTML artifact to a new state in one step, and files one version for it. The result lists the artifact's files and the baseVersion of this save, without the document, which did not change. Uploads at new paths are added. An upload at a path the page already has replaces that file: the page loads the new file from the same path, and the old one stays in History. Paths in remove are deleted. It all happens together or not at all: each upload is checked first (its size, type, and content), and if any file is at fault nothing changes and one refusal names every file. Pass the fileIds from page_files_request_uploads after their PUTs succeeded, from one call or several, up to ${String(pageBatchLimits.maxFilesPerPublish)}; uploads finished with files_finalize work too. On a link or public artifact the change may wait for a team owner's or admin's approval (status "pending"): readers outside the team get added and replaced files once it is approved, and removed files stop loading for every reader at once, as with files_delete. ${limitsNote}`,
      inputSchema: {
        artifact: artifactField(userId),
        uploads: z.array(z.uuid()).max(pageBatchLimits.maxFilesPerPublish).optional().describe("File ids of your uploads that were requested as page files (page_files_request_uploads, or files_request_upload with pagePath)"),
        remove: removeField.describe('Paths of page files to delete from the page, letter for letter, such as "js/old.js". To replace a file, upload it at the same path instead.'),
        baseVersion: z.string().max(80).optional().describe(baseVersionNote),
      },
    },
    ({ artifact, uploads, remove, baseVersion }) => withConflictResult(() => respond(async () => {
      const record = await editableArtifact(userId, artifact);
      const base = baseVersion === undefined ? undefined : parseBaseVersion(baseVersion);
      if (base === null) throw new BadBaseVersionError();
      const published = await publishPageFiles(userId, { artifactId: record.id, uploadIds: uploads ?? [], remove: remove ?? [], base }, "agent", harness);
      const current = await getEditableArtifact(userId, { id: record.id });
      if (!current) throw new UserFacingError("Artifact not found, or you cannot edit it.");
      // The artifact as this publish saved it. The document did not change, so the result leaves its content out: a page's files change without the agent reading the page again.
      const saved = await artifactResult(userId, await asReplaced(current, published));
      const { status, added, replaced, removed } = published;
      return { id: saved.id, url: saved.url, title: saved.title, kind: saved.kind, published: { status, added, replaced, removed }, files: saved.files, versionId: saved.versionId, baseVersion: saved.baseVersion };
    })),
  );
}

/** Registers the two tools that put many page files into an HTML artifact in few calls. Both are writes: a read-only connection never sees them. */
export function registerPageFileTools(server: McpServer, userId: string, access: McpAccess, harness: HarnessSource = noHarness) {
  const gated = gateTools(server, access);
  registerRequestUploads(gated, userId);
  registerPublish(gated, userId, harness);
}
