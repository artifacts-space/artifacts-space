"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ArtifactLoader } from "@/components/app/use-full-artifact";
import type { ArtifactDto } from "@/lib/artifact-types";

/** What the /dev/workspace fixture lets e2e tests drive (e2e/notification-opens-artifact.spec.ts). Development only. */
interface FixtureControls {
  /** A router refresh, as after a save that revalidates /app; the fixture has no server actions to do it. */
  refresh: () => void;
  /** How many loads are waiting for `releaseLoads` right now (`?slowload=1`); it drops to 0 on release, so it is not a running total. */
  heldLoads: () => number;
  /** Finishes every waiting load at once. */
  releaseLoads: () => void;
  /** How many links in the address bar the workspace has acted on. */
  linksHandled: () => number;
}

declare global {
  interface Window {
    fixture?: FixtureControls;
  }
}

/**
 * The fixture's test hooks in memory: a stand-in for the load server action
 * that holds the loads of the artifacts in `held` until the test releases
 * them, so a test can act while one is still opening, and answers any other
 * load at once (from `seed`, then the latest `setArtifacts`, or "not
 * found"); and a count of the links the workspace acted on. Seeding at
 * creation matters: a load can start in the first commit, before any effect
 * of the fixture has run.
 */
export function createFixtureStore(held: ReadonlySet<string> = new Set(), seed: readonly ArtifactDto[] = []) {
  let artifacts = seed;
  let handled = 0;
  const waiting: (() => void)[] = [];
  const load: ArtifactLoader = (publicId) => new Promise((resolve) => {
    const finish = () => {
      const found = artifacts.find((artifact) => artifact.publicId === publicId);
      resolve(found ? { success: true, data: found } : { success: false, error: "Artifact not found." });
    };
    if (held.has(publicId)) waiting.push(finish);
    else finish();
  });
  return {
    load,
    setArtifacts: (next: readonly ArtifactDto[]) => { artifacts = next; },
    held: () => waiting.length,
    release: () => { for (const finish of waiting.splice(0)) finish(); },
    countLink: () => { handled += 1; },
    linksHandled: () => handled,
  };
}

/**
 * Wires the fixture's controls onto `window.fixture`: a refresh, the held
 * loads, and a count of the links handled. Returns the loader to hand the
 * workspace (only with `slowLoad`; it holds the artifacts in `held`) and the
 * callback that counts links.
 */
export function useFixtureControls(slowLoad: boolean, artifacts: readonly ArtifactDto[], held: ReadonlySet<string>) {
  const router = useRouter();
  const [store] = useState(() => createFixtureStore(held, artifacts));
  // Later changes (an artifact moved to another project) reach the store here.
  useEffect(() => { store.setArtifacts(artifacts); }, [store, artifacts]);
  useEffect(() => {
    window.fixture = {
      refresh: () => { router.refresh(); },
      heldLoads: store.held,
      releaseLoads: store.release,
      linksHandled: store.linksHandled,
    };
    return () => { delete window.fixture; };
  }, [router, store]);
  return { loadArtifact: slowLoad ? store.load : undefined, onLinkHandled: store.countLink };
}
