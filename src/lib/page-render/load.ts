import { getArtifactAccess } from "@/lib/access";
import { getEditableArtifactDto } from "@/lib/artifacts";
import { pageAddressFor, type PageAddress } from "@/lib/page-files/address";
import { pageFilesKeyOf } from "@/lib/page-files/files-key";

import { openRenderToken } from "./token";

/** What the render page draws: one HTML artifact's page at the save its token names. */
export interface RenderPage {
  publicId: string;
  title: string;
  html: string;
  filesKey: string | undefined;
}

/**
 * The page a render token names, or null: for a token that does not open,
 * an artifact the person who asked can no longer edit, one that is not
 * HTML, or one saved since the token was made. One answer for every
 * reason. The edit check runs here again, as that person, so the token
 * grants nothing they could not do themselves.
 */
export async function loadRenderPage(token: string): Promise<RenderPage | null> {
  const grant = openRenderToken(token);
  if (!grant) return null;
  const dto = await getEditableArtifactDto(grant.userId, grant.artifactId);
  if (dto?.kind !== "html" || Date.parse(dto.updatedAt) !== grant.stamp) return null;
  return { publicId: dto.publicId, title: dto.title, html: dto.content, filesKey: pageFilesKeyOf(dto.files) };
}

/**
 * The page files address for the render page's frame, or null: the
 * artifact's own address rules (pageAddressFor), as the person who asked,
 * and only for the artifact the token names, while they may still edit it.
 */
export async function renderPageAddress(token: string, pageKey: string): Promise<PageAddress | null> {
  const grant = openRenderToken(token);
  if (!grant) return null;
  const access = await getArtifactAccess(pageKey, grant.userId);
  if (access?.record.id !== grant.artifactId || !access.canEdit) return null;
  return pageAddressFor({ pageKey }, grant.userId);
}
