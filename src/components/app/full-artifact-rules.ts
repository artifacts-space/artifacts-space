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

/**
 * Takes this tab's own later saves of the artifacts a blank page became
 * (New artifact): a blank page's last save can land after the pane took the
 * artifact over, and is then the newest copy. Only saves this tab made
 * itself come here, never the server's page answer, so a save by someone
 * else never reaches an open editor this way (its conflict check stays on
 * the version it started from). The same map when nothing is later.
 */
export function withOwnSaves(current: ReadonlyMap<string, ArtifactDto>, saves: readonly ArtifactDto[]): ReadonlyMap<string, ArtifactDto> {
  const later = saves.filter((saved) => {
    const held = current.get(saved.id);
    return held !== undefined && Date.parse(saved.updatedAt) > Date.parse(held.updatedAt);
  });
  if (later.length === 0) return current;
  const next = new Map(current);
  for (const saved of later) next.set(saved.id, saved);
  return next;
}

/** What this tab's own saves amount to, so a new save of the same artifact counts as a change. */
export function ownSavesKey(saves: readonly ArtifactDto[]): string {
  return saves.map((saved) => `${saved.id}@${saved.updatedAt}`).join(",");
}
