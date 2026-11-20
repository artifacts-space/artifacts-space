import type { ActionResult } from "@/lib/artifact-types";

/**
 * The window event that sets how the fixture's requests for people to
 * mention fare, with `detail` one of `FixtureNetwork`. A test sends it with
 * `page.evaluate`.
 */
export const FIXTURE_MENTIONS_NETWORK = "fixture:mentions-network";

/** Requests answer at once ("ok"), wait until the network is set again ("hold"), or fail ("fail"). */
type FixtureNetwork = "ok" | "hold" | "fail";

const failure = { success: false as const, error: "Suggestions could not be loaded." };

function isNetwork(value: unknown): value is FixtureNetwork {
  return value === "ok" || value === "hold" || value === "fail";
}

/**
 * Wraps an in-memory answer in a network the test steers. It starts "ok".
 * Held requests answer when the network is set again: with the answer then,
 * or as a failure when it is set to "fail". One listener for the page's
 * life, as the store it serves is.
 */
export function steeredNetwork<T>(answer: () => T): () => Promise<ActionResult<T>> {
  let network: FixtureNetwork = "ok";
  let held: (() => void)[] = [];
  const settle = (): Promise<ActionResult<T>> => Promise.resolve(network === "fail" ? failure : { success: true, data: answer() });
  if (typeof window !== "undefined") {
    window.addEventListener(FIXTURE_MENTIONS_NETWORK, (event) => {
      if (!(event instanceof CustomEvent) || !isNetwork(event.detail)) return;
      network = event.detail;
      if (network === "hold") return;
      const waiting = held;
      held = [];
      for (const release of waiting) release();
    });
  }
  return () => {
    if (network !== "hold") return settle();
    return new Promise<void>((resolve) => { held.push(resolve); }).then(settle);
  };
}
