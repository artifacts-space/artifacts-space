/**
 * Size limits for one artifact, enforced in the data layer (src/lib/artifacts.ts)
 * and again by database CHECK constraints. Format-specific limits, such as
 * ui spec size, live with the format validators and stay smaller.
 */
export const artifactSizeLimits = {
  /** Largest content, in UTF-8 bytes. */
  maxContentBytes: 1_048_576,
  /** Largest metadata object, in UTF-8 bytes of its JSON text. */
  maxMetadataBytes: 65_536,
} as const;

const encoder = new TextEncoder();

/** UTF-8 byte length of a string. */
export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

/**
 * The first size problem with an artifact's content or metadata, written for
 * the person or agent who sent it, or null when both fit.
 */
export function artifactSizeProblem(input: { content?: string | undefined; metadata?: Record<string, unknown> | undefined }): string | null {
  if (input.content !== undefined && byteLength(input.content) > artifactSizeLimits.maxContentBytes) {
    return "The content is larger than 1 MB. Split it into smaller artifacts.";
  }
  if (input.metadata !== undefined && byteLength(JSON.stringify(input.metadata)) > artifactSizeLimits.maxMetadataBytes) {
    return "The metadata is larger than 64 KB. Keep metadata to short fields.";
  }
  return null;
}
