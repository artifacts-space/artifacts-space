import { formatBytes } from "@/lib/files/config";

/**
 * Storage quotas per account. An account is a person plus the agents they
 * own, so adding agents never multiplies the quota. Client-safe.
 *
 * Why these numbers: a typical artifact is 10–20 KB, so 100 MB of artifact
 * content is thousands of artifacts (years of heavy use), and still 100 of
 * the largest (1 MB) ones. Postgres storage costs about $0.35 per GB-month,
 * so a full quota costs about $0.035 a month. Files live in R2 at about
 * $0.015 per GB-month; 1 GB holds 40 of the largest (25 MB) files or
 * hundreds of typical ones, for about $0.015 a month. Both stop a single
 * account from growing the bill without bound.
 */
export const storageQuota = {
  /** Total bytes of artifact content per account. */
  contentBytes: 100 * 1024 * 1024,
  /** Total bytes of files per account: finished uploads, and uploads started within the last hour. */
  fileBytes: 1024 * 1024 * 1024,
} as const;

/** What a quota check needs: bytes in use, bytes this change adds, and the limit. */
interface QuotaInput {
  used: number;
  adding: number;
  limit: number;
}

/** Whether a change fits. Changes that add nothing always fit, so people can always shrink or delete. */
export function fitsQuota({ used, adding, limit }: QuotaInput): boolean {
  return adding <= 0 || used + adding <= limit;
}

/**
 * Bytes a content save adds to the account. Every save also files a version
 * (src/lib/versions), so a save that grows the content adds the growth plus
 * the new version. A save that does not grow it adds nothing, so people can
 * always shrink or fix an artifact; version pruning keeps history bounded.
 */
export function contentBytesAdded(newBytes: number, previousBytes: number): number {
  const growth = newBytes - previousBytes;
  return growth <= 0 ? 0 : growth + newBytes;
}

/** The refusal for artifact content over quota, or null when it fits. */
export function contentQuotaProblem(input: QuotaInput): string | null {
  if (fitsQuota(input)) return null;
  return `Artifacts and their saved versions in your account use ${formatBytes(input.used)} of ${formatBytes(input.limit)}, and this needs ${formatBytes(input.adding)} more. Delete or shorten artifacts you no longer need, then try again.`;
}

/** The refusal for a file upload over quota, or null when it fits. */
export function fileQuotaProblem(input: QuotaInput): string | null {
  if (fitsQuota(input)) return null;
  return `Files in your account use ${formatBytes(input.used)} of ${formatBytes(input.limit)}, so this ${formatBytes(input.adding)} file does not fit. Delete files you no longer need, then try again.`;
}

/** Environment overrides for the quotas, in bytes. Unset or invalid values keep the defaults. */
export interface QuotaEnv {
  STORAGE_QUOTA_CONTENT_BYTES?: string | undefined;
  STORAGE_QUOTA_FILE_BYTES?: string | undefined;
}

function positiveBytes(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** The quotas in force: the defaults above, or STORAGE_QUOTA_CONTENT_BYTES / STORAGE_QUOTA_FILE_BYTES when set. */
export function quotaLimits(env: QuotaEnv): { contentBytes: number; fileBytes: number } {
  return {
    contentBytes: positiveBytes(env.STORAGE_QUOTA_CONTENT_BYTES, storageQuota.contentBytes),
    fileBytes: positiveBytes(env.STORAGE_QUOTA_FILE_BYTES, storageQuota.fileBytes),
  };
}
