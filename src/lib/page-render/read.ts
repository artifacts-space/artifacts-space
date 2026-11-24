import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact } from "@/lib/access";
import { siteUrl } from "@/lib/site-origin";
import { UserFacingError } from "@/lib/user-facing-error";

import { browserRunConfigFromEnv, drawPage, type BrowserRunConfig, type DrawnPage } from "./browser";
import { pageImageRefusals, pageViewportSchema, renderPagePath, type PageImageFacts, type PageImageRefusal, type PageViewport } from "./rules";
import { mintRenderToken } from "./token";

/*
 * A picture of an HTML artifact's page, for artifacts_page_image. Only for
 * a caller who may edit the artifact: an edit to a link or public page can
 * wait for approval, so the latest save must never reach a reader of the
 * approved version. The page is drawn by a hosted browser that opens the
 * site's render page under a render token, so it runs exactly as readers
 * see it: on its page host, in its sandbox, with its files.
 */

export interface PageImageInput {
  publicId: string;
  width?: number | undefined;
  height?: number | undefined;
}

export type PageImageResult = { state: "image"; facts: PageImageFacts; picture: DrawnPage } | { state: "refused"; refusal: PageImageRefusal };

/** What a read needs from outside: the browser's settings and how to draw. Tests replace them. */
export interface PageImageDeps {
  config: () => BrowserRunConfig | null;
  draw: typeof drawPage;
  now: () => Date;
}

const defaultDeps: PageImageDeps = { config: () => browserRunConfigFromEnv(), draw: drawPage, now: () => new Date() };

const notEditable = "Artifact not found, or you cannot edit it.";

/** The window to draw in: the caller's sizes, checked, or the defaults. A size outside the limits is a clear error. */
function viewportFor(input: PageImageInput): PageViewport {
  const parsed = pageViewportSchema.safeParse({ width: input.width, height: input.height });
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Choose another window size.");
  return parsed.data;
}

/**
 * Draws the page of an HTML artifact `userId` may edit, at its newest save.
 * Where pictures are not set up, it says so before it counts or reads
 * anything. Then it counts the draw (`pageImageRead`), runs the edit check,
 * and hands the hosted browser a render token for this save. When the
 * drawing fails it looks once more: a page saved meanwhile is
 * `page_changed`, anything else `page_not_drawn`.
 */
export async function readPageImage(userId: string, input: PageImageInput, deps: PageImageDeps = defaultDeps): Promise<PageImageResult> {
  const viewport = viewportFor(input);
  const config = deps.config();
  if (!config) return { state: "refused", refusal: pageImageRefusals.off };
  await enforceRateLimit("pageImageRead", userId);
  const record = await getEditableArtifact(userId, { publicId: input.publicId });
  if (!record) throw new UserFacingError(notEditable);
  if (record.kind !== "html") return { state: "refused", refusal: pageImageRefusals.notHtml };
  const token = mintRenderToken({ userId, artifactId: record.id, stamp: record.updatedAt.getTime() }, deps.now());
  const picture = await deps.draw(config, siteUrl(renderPagePath(token)), viewport);
  if (!picture) {
    const now = await getEditableArtifact(userId, { id: record.id });
    const changed = now !== null && now.updatedAt.getTime() !== record.updatedAt.getTime();
    return { state: "refused", refusal: changed ? pageImageRefusals.changed : pageImageRefusals.notDrawn };
  }
  return { state: "image", facts: { title: record.title, viewport, savedAt: record.updatedAt.toISOString(), drawnAt: deps.now().toISOString() }, picture };
}
