import { getArtifactAccess } from "@/lib/access";
import { servedVersionTime } from "@/lib/files/download";
import { pageLabelFor } from "@/lib/page-host/rules";
import { getVersionOf } from "@/lib/versions/history";

import { mintPageToken } from "./token";

/** Where a page loads its files from: the token for its frame's address, and when it ends. */
export interface PageAddress {
  token: string;
  /** ISO time. The frame asks for a new address before it loads the page again after this. */
  expiresAt: string;
}

/** Which page: the artifact's public id, and optionally one version of it in History. */
export interface PageAddressRequest {
  pageKey: string;
  versionId?: string | undefined;
}

type Access = NonNullable<Awaited<ReturnType<typeof getArtifactAccess>>>;

/** Which files a viewer gets: as they were at `asOf` (null for the latest), and the save the address is made for. */
interface FilesTime {
  asOf: Date | null;
  /** The save time of what the viewer is shown. A newer save they are shown gives a new address; one they are not shown never changes it. */
  stamp: Date;
}

/**
 * The files a viewer gets: those of the version in History they asked for
 * (people who may edit only), else of the approved version they are
 * served, else the latest. Null when they asked for a version they may not
 * read or that does not exist.
 */
async function filesTime(access: Access, versionId: string | undefined): Promise<FilesTime | null> {
  if (versionId === undefined) return { asOf: servedVersionTime(access), stamp: access.served.updatedAt };
  if (!access.canEdit) return null;
  const version = await getVersionOf(access.record.id, versionId);
  return version ? { asOf: version.savedAt, stamp: version.savedAt } : null;
}

/**
 * The page files address for one viewer of one HTML artifact, or null when
 * they may not read it (the same answer as for an artifact that does not
 * exist). This is where the access check for page files happens: the page
 * host only checks the token made here. A reader of the approved version
 * gets a token for the files as that version had them, never the latest,
 * and their address does not change when an edit they are not shown is saved.
 */
export async function pageAddressFor(request: PageAddressRequest, viewerId: string | null, now: Date = new Date()): Promise<PageAddress | null> {
  const access = await getArtifactAccess(request.pageKey, viewerId);
  if (access?.record.kind !== "html") return null;
  const time = await filesTime(access, request.versionId);
  if (!time) return null;
  const label = await pageLabelFor(request.pageKey);
  const { token, expiresAt } = mintPageToken({ artifactId: access.record.id, label, asOf: time.asOf, stamp: time.stamp.getTime() }, now);
  return { token, expiresAt: expiresAt.toISOString() };
}
