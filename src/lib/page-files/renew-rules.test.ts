import { describe, expect, it } from "vitest";

import { heldPass, passRenewal, renewalOutcome, renewStep } from "./renew-rules";
import { pageTokenLimits } from "./token";

const minute = 60_000;
const start = Date.parse("2026-11-17T12:00:00.000Z");

describe("heldPass", () => {
  it("should renew an address of usual life two minutes before its end", () => {
    for (const life of [10 * minute, 12.5 * minute, 15 * minute]) {
      expect(heldPass(start + life, start).renewAt).toBe(start + life - passRenewal.leadMs);
    }
  });

  it("should renew an address that arrived with little life left in its last quarter, never on arrival", () => {
    expect(heldPass(start + 61_000, start).renewAt).toBe(start + 61_000 - 15_250);
    expect(heldPass(start + 12_000, start).renewAt).toBe(start + 9_000);
  });

  it("should treat an address that already ended as due", () => {
    expect(heldPass(start - 5, start).renewAt).toBe(start - 5);
  });

  it("should always renew inside a later step than the address was made in, so the server answers with a later address", () => {
    // An address ends lifeSeconds after the start of its step; one made at any moment of that step is renewed after the step ended.
    const stepMs = pageTokenLimits.stepSeconds * 1000;
    const endsAt = start + pageTokenLimits.lifeSeconds * 1000;
    for (const madeAt of [start, start + stepMs / 2, start + stepMs - 1]) {
      expect(heldPass(endsAt, madeAt).renewAt).toBeGreaterThanOrEqual(start + stepMs);
    }
  });
});

describe("renewStep", () => {
  const pass = heldPass(start + 10 * minute, start);

  it("should wait on one timer, set from the known time, while the tab is shown", () => {
    expect(renewStep(pass, true, start)).toEqual({ do: "wait", delayMs: 8 * minute });
    expect(renewStep(pass, true, start + 7 * minute)).toEqual({ do: "wait", delayMs: minute });
  });

  it("should ask when the address is close to its end or has ended, while the tab is shown", () => {
    expect(renewStep(pass, true, start + 8 * minute)).toEqual({ do: "ask" });
    expect(renewStep(pass, true, start + 30 * minute)).toEqual({ do: "ask" });
  });

  it("should never ask and never set a timer while the tab is hidden", () => {
    for (const now of [start, start + 8 * minute, start + 30 * minute]) {
      expect(renewStep(pass, false, now)).toEqual({ do: "rest" });
    }
  });

  it("should rest when there is no address to renew", () => {
    expect(renewStep(null, true, start)).toEqual({ do: "rest" });
  });
});

describe("renewalOutcome", () => {
  const pass = heldPass(start + 10 * minute, start);
  const iso = (ms: number) => new Date(ms).toISOString();

  it("should take an address that ends later, and time its own renewal from when it arrived", () => {
    const now = start + 8 * minute;
    expect(renewalOutcome(pass, { token: "next", expiresAt: iso(start + 20 * minute) }, now)).toEqual({ kind: "renewed", token: "next", pass: { endsAt: start + 20 * minute, renewAt: start + 18 * minute } });
  });

  it("should read no address as a refusal", () => {
    expect(renewalOutcome(pass, null, start)).toEqual({ kind: "refused" });
  });

  it("should not count the same address, an earlier one, or an unreadable end as new", () => {
    expect(renewalOutcome(pass, { token: "same", expiresAt: iso(start + 10 * minute) }, start)).toEqual({ kind: "same" });
    expect(renewalOutcome(pass, { token: "older", expiresAt: iso(start + 5 * minute) }, start)).toEqual({ kind: "same" });
    expect(renewalOutcome(pass, { token: "odd", expiresAt: "not a time" }, start)).toEqual({ kind: "same" });
  });
});
