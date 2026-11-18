import { describe, expect, it } from "vitest";

import { heldPass, hiddenAllowanceWords, passRenewal, renewalOutcome, renewStep } from "./renew-rules";
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
    expect(renewStep(pass, null, start)).toEqual({ do: "wait", delayMs: 8 * minute });
    expect(renewStep(pass, null, start + 7 * minute)).toEqual({ do: "wait", delayMs: minute });
  });

  it("should ask when the address is close to its end or has ended, while the tab is shown", () => {
    expect(renewStep(pass, null, start + 8 * minute)).toEqual({ do: "ask" });
    expect(renewStep(pass, null, start + 30 * minute)).toEqual({ do: "ask" });
  });

  describe("while the tab is hidden", () => {
    const hour = passRenewal.hiddenMs;

    it("should wait and ask like a shown tab inside its hour", () => {
      expect(renewStep(pass, start, start)).toEqual({ do: "wait", delayMs: 8 * minute });
      expect(renewStep(pass, start, start + 7 * minute)).toEqual({ do: "wait", delayMs: minute });
      expect(renewStep(pass, start, start + 8 * minute)).toEqual({ do: "ask" });
      expect(renewStep(pass, start, start + 30 * minute)).toEqual({ do: "ask" });
      expect(renewStep(pass, start, start + hour - 1)).toEqual({ do: "ask" });
    });

    it("should rest once its hour has ended, however due the address is", () => {
      expect(renewStep(pass, start, start + hour)).toEqual({ do: "rest" });
      expect(renewStep(pass, start, start + hour + 5 * minute)).toEqual({ do: "rest" });
      expect(renewStep(heldPass(start + 3 * hour, start), start, start + 2 * hour)).toEqual({ do: "rest" });
    });

    it("should not ask when a timer set inside the hour fires after it", () => {
      // The time to renew is at 59 minutes, inside the hour; the timer fires two minutes late, past the hour's end.
      const dueInside = heldPass(start + 61 * minute, start + 50 * minute);
      expect(dueInside.renewAt).toBe(start + 59 * minute);
      expect(renewStep(dueInside, start, start + 55 * minute)).toEqual({ do: "wait", delayMs: 4 * minute });
      expect(renewStep(dueInside, start, start + 61 * minute)).toEqual({ do: "rest" });
    });

    it("should hold no timer when the time to renew falls after the hour", () => {
      expect(renewStep(heldPass(start + hour + 10 * minute, start), start, start)).toEqual({ do: "rest" });
    });

    it("should ask at once when shown again after the hour with an address near or past its end", () => {
      const shownAt = start + 2 * hour;
      expect(renewStep(pass, start, shownAt)).toEqual({ do: "rest" });
      expect(renewStep(pass, null, shownAt)).toEqual({ do: "ask" });
      const nearEnd = heldPass(shownAt + minute, shownAt - 20 * minute);
      expect(renewStep(nearEnd, null, shownAt)).toEqual({ do: "ask" });
    });

    it("should start a new hour each time the tab is hidden again", () => {
      // Hidden at the start, shown at 40 minutes, hidden again at 50: the first hour would have ended at 60.
      const hiddenAgainAt = start + 50 * minute;
      const dueAt = start + 65 * minute;
      const due = heldPass(dueAt + 2 * minute, dueAt - 8 * minute);
      expect(renewStep(due, start, dueAt)).toEqual({ do: "rest" });
      expect(renewStep(due, hiddenAgainAt, dueAt)).toEqual({ do: "ask" });
      expect(renewStep(due, hiddenAgainAt, hiddenAgainAt + hour)).toEqual({ do: "rest" });
    });
  });

  it("should rest when there is no address to renew, shown or hidden", () => {
    expect(renewStep(null, null, start)).toEqual({ do: "rest" });
    expect(renewStep(null, start, start)).toEqual({ do: "rest" });
  });
});

describe("hiddenAllowanceWords", () => {
  it("should say the hidden allowance in words", () => {
    expect(hiddenAllowanceWords()).toBe("one hour");
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
