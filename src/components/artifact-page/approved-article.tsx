import { cacheLife } from "next/cache";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import type { FileDto } from "@/lib/files/types";
import { cachedVersionView } from "@/lib/versions/cache";

/**
 * The rendered body of an approved version, cached by version id, save time, and files.
 * Readers outside the team of a link or public artifact all see the same
 * approved version, so the render is shared. Only render it after the access
 * check chose this version for the viewer (see src/lib/versions/cache.ts).
 * `pageKey` is the artifact's public id, for an HTML page's host.
 */
export async function ApprovedArticle({ versionId, savedAt, files, pageKey }: { versionId: string; savedAt: string; files: FileDto[]; pageKey: string }) {
  "use cache";
  cacheLife("days");
  const view = await cachedVersionView(versionId, savedAt);
  if (!view) return null;
  return <ArtifactView kind={view.kind} content={view.content} title={view.title} language={view.language} files={files} pageKey={pageKey} />;
}
