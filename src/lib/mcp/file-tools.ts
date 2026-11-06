import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";

import { createArtifact, getOwnArtifactByPublicId, toArtifactDtos } from "@/lib/artifacts";
import { allowedTypesHint, fileLimits, formatBytes } from "@/lib/files/config";
import { assertUsableFiles, attachFiles, deleteOwnFile } from "@/lib/files/attach";
import { findReadableFile, signedFileUrl } from "@/lib/files/download";
import { finalizeUpload, requestUpload } from "@/lib/files/uploads";
import type { ArtifactRecord } from "@/db/schema";
import type { McpAccess } from "@/lib/oauth/scopes";
import { isPublicId } from "@/lib/public-id";
import { siteUrl } from "@/lib/site-origin";
import { listTeamsForUser } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { toMcpArtifact } from "./artifact-view";
import { gateTools, type ToolServer } from "./tool-access";

const fileIdField = z.uuid().describe("File id from files_request_upload");
const fileIdsField = z.array(z.uuid()).min(1).max(fileLimits.maxFilesPerArtifact).describe("Ids of finished uploads (files_finalize)");
const artifactIdField = z.string().refine(isPublicId, "Use the artifact's 22-character id.").describe("Your artifact's id (22 characters)");

const flow = `Upload flow: 1) files_request_upload with the filename, type, and exact byte size. 2) PUT the bytes to upload.url with exactly upload.headers, for example: curl -X PUT -H "Content-Type: <type>" --data-binary @<path> "<url>" (curl sets Content-Length). The URL works for ${String(fileLimits.uploadUrlSeconds / 60)} minutes. 3) files_finalize with the file id. 4) files_create_artifact or files_attach, within a day, or the upload is deleted.`;

/** Runs a tool and returns JSON text. Errors written for the caller pass through; others are logged and replaced. */
async function respond(run: () => Promise<unknown>) {
  try {
    const value = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    if (error instanceof UserFacingError || error instanceof ZodError) throw error;
    console.error("[mcp] File tool failed", error instanceof Error ? error.name : "unknown error");
    throw new Error("Something went wrong on the server. Try again.");
  }
}

async function artifactResult(userId: string, record: ArtifactRecord) {
  const [[dto], teams] = await Promise.all([toArtifactDtos([record]), listTeamsForUser(userId)]);
  if (!dto) throw new UserFacingError("Artifact not found.");
  return toMcpArtifact(dto, { viewerId: userId, teamSlugs: new Map(teams.map((team) => [team.id, team.slug])), urlFor: (publicId) => siteUrl(`/artifact/${publicId}`) });
}

async function ownArtifact(userId: string, publicId: string) {
  const record = await getOwnArtifactByPublicId(userId, publicId);
  if (!record) throw new UserFacingError("Artifact not found, or you are not its author.");
  return record;
}

function registerUploadTools(server: ToolServer, userId: string) {
  server.registerTool(
    "files_request_upload",
    {
      title: "Request a file upload",
      description: `Starts a file upload and returns a presigned PUT URL. Up to ${formatBytes(fileLimits.maxBytes)} per file. Allowed: ${allowedTypesHint}. ${flow}`,
      inputSchema: {
        filename: z.string().min(1).max(255).describe("File name with its extension, such as report.pdf"),
        contentType: z.string().max(255).optional().describe("MIME type, such as application/pdf. Omit to use the extension."),
        size: z.number().int().positive().describe("Exact size in bytes. The PUT must send exactly this many bytes."),
      },
    },
    (input) => respond(async () => {
      const started = await requestUpload(userId, input);
      const { upload, file } = started;
      return {
        file,
        upload: { method: upload.method, url: upload.url, headers: upload.headers, expiresAt: upload.expiresAt.toISOString() },
        curl: `curl -X PUT -H "Content-Type: ${upload.headers["Content-Type"]}" --data-binary @${JSON.stringify(file.filename)} ${JSON.stringify(upload.url)}`,
        next: `After the PUT succeeds, call files_finalize with fileId "${file.id}".`,
      };
    }),
  );

  server.registerTool(
    "files_finalize",
    {
      title: "Finish a file upload",
      description: "Checks an uploaded file's size, type, and content, and makes it usable. Call after the PUT succeeds. A file that does not match its request is deleted.",
      inputSchema: { fileId: fileIdField },
    },
    ({ fileId }) => respond(async () => ({ file: await finalizeUpload(userId, fileId), next: "Use the id in files_create_artifact, files_attach, or an Image or File element of a ui artifact." })),
  );
}

function registerArtifactFileTools(server: ToolServer, userId: string) {
  server.registerTool(
    "files_create_artifact",
    {
      title: "Create a file artifact",
      description: "Creates a private artifact that holds finished uploads, with optional Markdown notes. Share it afterwards with artifacts_update (visibility).",
      inputSchema: {
        title: z.string().min(1).max(160),
        files: fileIdsField,
        notes: z.string().max(100_000).optional().describe("Markdown shown above the files"),
        summary: z.string().max(600).optional(),
        project: z.string().max(120).optional(),
        source: z.string().max(120).optional().describe("Agent or harness name"),
      },
    },
    ({ files, notes, ...input }) => respond(async () => {
      await assertUsableFiles(userId, null, files);
      const created = await createArtifact(userId, { ...input, kind: "file", content: notes ?? "" });
      await attachFiles(userId, created.id, files, "agent");
      return artifactResult(userId, await ownArtifact(userId, created.publicId));
    }),
  );

  server.registerTool(
    "files_attach",
    {
      title: "Attach files to an artifact",
      description: "Adds finished uploads to your own artifact. A file belongs to one artifact. In a ui artifact, Image and File elements can then show them.",
      inputSchema: { artifact: artifactIdField, files: fileIdsField },
    },
    ({ artifact, files }) => respond(async () => {
      const record = await ownArtifact(userId, artifact);
      await attachFiles(userId, record.id, files, "agent");
      return artifactResult(userId, record);
    }),
  );
}

function registerAccessTools(server: ToolServer, userId: string) {
  server.registerTool(
    "files_get_download_url",
    {
      title: "Get a file download URL",
      description: `Returns a short-lived URL (about ${String(fileLimits.downloadUrlSeconds / 60)} minutes) for a file you can read: your own uploads, and files of artifacts you can view. Fetch it with curl -L -o <name> "<url>".`,
      inputSchema: { fileId: fileIdField, download: z.boolean().optional().describe("True to always download as an attachment") },
    },
    ({ fileId, download }) => respond(async () => {
      const file = await findReadableFile(fileId, userId);
      if (!file) throw new UserFacingError("File not found.");
      const signed = await signedFileUrl(file, { download: download ?? false });
      return { id: file.id, filename: file.filename, contentType: file.contentType, size: file.size, url: signed.url, expiresAt: signed.expiresAt.toISOString() };
    }),
  );

  server.registerTool(
    "files_delete",
    {
      title: "Delete a file",
      description: "Permanently deletes your own unattached upload, or a file from an artifact you wrote.",
      inputSchema: { fileId: fileIdField },
    },
    ({ fileId }) => respond(async () => {
      await deleteOwnFile(userId, fileId, "agent");
      return { deleted: true, fileId };
    }),
  );
}

/**
 * Registers the file tools: request an upload URL, finalize it, put files in
 * an artifact, get a download URL, and delete. Reads go through the artifact
 * access check; writes are the author's only, and are left out for read-only access.
 */
export function registerFileTools(server: McpServer, userId: string, access: McpAccess) {
  const gated = gateTools(server, access);
  registerUploadTools(gated, userId);
  registerArtifactFileTools(gated, userId);
  registerAccessTools(gated, userId);
}
