import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import type { ArtifactInput } from "@/lib/artifact-types";
import { createArtifact } from "@/lib/artifacts";
import { assertUsableFiles, attachFiles } from "@/lib/files/attach";

import { artifactCreatedByRequest, CreateRequestTaken } from "./created-by-request";

/**
 * The web app's create for a blank page: once per create id. A retry after a
 * lost response, or two requests racing, hands back the artifact the first
 * one stored (artifact_user_create_request_idx makes the insert atomic), and
 * still counts against the create limit. Dropped files are checked first and
 * attached only by the create that stored the artifact. A Markdown artifact
 * may start with a title and no body yet; agents' creates never may.
 */
export async function createArtifactOnce(userId: string, input: ArtifactInput, fileIds: readonly string[], requestId: string | null): Promise<{ id: string; created: boolean }> {
  if (requestId) {
    const earlier = await artifactCreatedByRequest(userId, requestId);
    if (earlier) {
      await enforceRateLimit("artifactCreate", userId);
      return { id: earlier, created: false };
    }
  }
  await assertUsableFiles(userId, null, fileIds);
  try {
    const created = await createArtifact(userId, { ...input, source: input.source || "web" }, { emptyMarkdown: true, ...(requestId ? { createRequestId: requestId } : {}) });
    if (fileIds.length > 0) await attachFiles(userId, created.id, fileIds, "person");
    return { id: created.id, created: true };
  } catch (error) {
    if (!(error instanceof CreateRequestTaken) || !requestId) throw error;
    const stored = await artifactCreatedByRequest(userId, requestId);
    if (!stored) throw error;
    return { id: stored, created: false };
  }
}
