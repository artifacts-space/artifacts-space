import type { ArtifactDto } from "@/lib/artifact-types";

/** The artifacts by id. */
export function byId(artifacts: readonly ArtifactDto[] | undefined): ReadonlyMap<string, ArtifactDto> {
  return new Map(artifacts?.map((artifact) => [artifact.id, artifact]));
}

/** Adds the artifacts not held yet; what is held already (perhaps just saved) stays. The same map when nothing is new, so state does not change. */
export function withMissing(current: ReadonlyMap<string, ArtifactDto>, artifacts: readonly ArtifactDto[]): ReadonlyMap<string, ArtifactDto> {
  const missing = artifacts.filter((artifact) => !current.has(artifact.id));
  if (missing.length === 0) return current;
  const next = new Map(current);
  for (const artifact of missing) next.set(artifact.id, artifact);
  return next;
}

/**
 * What the seeded artifacts amount to, for telling a real change from a new
 * array with the same artifacts: only new ids matter, since held artifacts
 * are never replaced from the seed (withMissing).
 */
export function seedKey(artifacts: readonly ArtifactDto[] | undefined): string {
  return artifacts?.map((artifact) => artifact.id).join(",") ?? "";
}
