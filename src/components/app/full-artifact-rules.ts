import type { ArtifactDto } from "@/lib/artifact-types";

/** The artifacts by id. */
export function byId(artifacts: readonly ArtifactDto[] | undefined): ReadonlyMap<string, ArtifactDto> {
  return new Map(artifacts?.map((artifact) => [artifact.id, artifact]));
}

/** Whether `seed` is a later save than `held`: only then may it replace what is held. */
function savedLater(seed: ArtifactDto, held: ArtifactDto | undefined): boolean {
  return held === undefined || Date.parse(seed.updatedAt) > Date.parse(held.updatedAt);
}

/**
 * Adds the artifacts not held yet, and replaces a held one only with a later
 * save of it (a blank page's last save, which lands after the pane has taken
 * the artifact over); what is held already (perhaps just saved) stays
 * otherwise. The same map when nothing is new, so state does not change.
 */
export function withMissing(current: ReadonlyMap<string, ArtifactDto>, artifacts: readonly ArtifactDto[]): ReadonlyMap<string, ArtifactDto> {
  const fresher = artifacts.filter((artifact) => savedLater(artifact, current.get(artifact.id)));
  if (fresher.length === 0) return current;
  const next = new Map(current);
  for (const artifact of fresher) next.set(artifact.id, artifact);
  return next;
}

/**
 * What the seeded artifacts amount to, for telling a real change from a new
 * array with the same artifacts: new ids, and new saves of the same ids
 * (withMissing takes only later ones).
 */
export function seedKey(artifacts: readonly ArtifactDto[] | undefined): string {
  return artifacts?.map((artifact) => `${artifact.id}@${artifact.updatedAt}`).join(",") ?? "";
}
