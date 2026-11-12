import { z } from "zod";

import type { ArtifactDto } from "@/lib/artifact-types";
import { EditConflictError } from "@/lib/edits/conflict-error";
import { encodeBaseVersion } from "@/lib/edits/edit-conflict-rules";
import { versionAt } from "@/lib/versions/history";

/**
 * How agents name the version they read (src/lib/edits): every tool that
 * hands an agent an artifact it may edit also hands it `versionId` and
 * `baseVersion`, and the write tools take `baseVersion` back. A refused save
 * comes back as a typed tool error.
 */

export const BASE_VERSION_DESCRIPTION =
  "The `baseVersion` you got with the content you are changing (artifacts_get, or the result of your last save). Always pass it: the save is refused, and nothing is saved, if the artifact changed since you read it. Then read it again with artifacts_get, merge your changes into the new content, and save with the new baseVersion; never resend blindly. Without it, the save is refused (base_version_required) whenever a person saved the artifact last, and a change to the title, content, or format is also refused while a person is typing in it: read the artifact with artifacts_get and pass its baseVersion. Only artifacts that agents saved last take saves without one.";

/** The `baseVersion` input of a write tool. */
export const baseVersionField = z.string().max(80).optional().describe(BASE_VERSION_DESCRIPTION);

/** What an agent gets with an artifact it may edit: the id of the version it read, and the token to send back. */
export interface McpBaseVersion {
  versionId: string | null;
  baseVersion: string;
}

/**
 * The version an agent reads or wrote, and the token of its save time.
 * `updatedAt` is the save time of the content the agent got: what it read,
 * or after a save, what its own save wrote, never a later read. A token from
 * a later read would name a person's save the agent never saw, and the
 * agent's next update, built on what it wrote, would overwrite that person.
 */
export async function baseVersionOf(artifactId: string, updatedAt: string): Promise<McpBaseVersion> {
  const version = await versionAt(artifactId, new Date(updatedAt));
  const versionId = version?.id ?? null;
  return { versionId, baseVersion: encodeBaseVersion({ versionId, updatedAt }) };
}

/** The fields a save wrote, which an agent's next update builds on. */
const savedFields = ["title", "icon", "theme", "cover", "summary", "content", "kind", "language", "source", "metadata", "harness", "updatedBy", "updatedAt"] as const satisfies readonly (keyof ArtifactDto)[];

/**
 * The artifact as an agent's own save left it, for the save's result: the
 * current sharing, files, and settings, with the saved fields from `saved`,
 * the DTO of the save itself. When nobody saved since, that is `current`.
 * The result's content and its baseVersion then always describe the same
 * save (baseVersionOf with `saved.updatedAt`).
 */
export function asSaved(current: ArtifactDto, saved: ArtifactDto): ArtifactDto {
  if (current.updatedAt === saved.updatedAt) return current;
  const written: Partial<ArtifactDto> = {};
  for (const field of savedFields) Object.assign(written, { [field]: saved[field] });
  return { ...current, ...written };
}

/** A tool result that is a typed refusal: the message as text, and the code and who changed it as structured content. */
export function editConflictResult(error: EditConflictError) {
  const changedBy = error.changedBy ? { handle: error.changedBy.handle, via: error.changedBy.harness?.name ?? "web" } : null;
  return {
    isError: true,
    content: [{ type: "text" as const, text: error.message }],
    structuredContent: { error: { code: error.code, message: error.message, changedBy, nextStep: "artifacts_get" } },
  };
}

/** Runs a tool body, returning an EditConflictError as a typed tool error instead of throwing it. */
export async function withConflictResult<T>(run: () => Promise<T>): Promise<T | ReturnType<typeof editConflictResult>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof EditConflictError) return editConflictResult(error);
    throw error;
  }
}
