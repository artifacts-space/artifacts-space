import { describe, expect, it } from "vitest";

import { scrollShare, scrollTopForShare } from "./detail-scroll";

describe("scrollShare", () => {
  it("should be 0 when the box is at the top", () => {
    expect(scrollShare({ scrollTop: 0, scrollHeight: 2000, clientHeight: 500 })).toBe(0);
  });

  it("should be 1 when the box is at the bottom", () => {
    expect(scrollShare({ scrollTop: 1500, scrollHeight: 2000, clientHeight: 500 })).toBe(1);
  });

  it("should be the share of the scroll range when the box is part way down", () => {
    expect(scrollShare({ scrollTop: 750, scrollHeight: 2000, clientHeight: 500 })).toBe(0.5);
  });

  it("should be 0 when the box cannot scroll", () => {
    expect(scrollShare({ scrollTop: 0, scrollHeight: 400, clientHeight: 500 })).toBe(0);
  });

  it("should stay between 0 and 1 when the box overscrolls", () => {
    expect(scrollShare({ scrollTop: 1600, scrollHeight: 2000, clientHeight: 500 })).toBe(1);
    expect(scrollShare({ scrollTop: -20, scrollHeight: 2000, clientHeight: 500 })).toBe(0);
  });
});

describe("scrollTopForShare", () => {
  it("should put a taller box the same share of the way down when the content grows", () => {
    expect(scrollTopForShare(0.5, { scrollHeight: 5000, clientHeight: 1000 })).toBe(2000);
  });

  it("should be 0 when the box cannot scroll", () => {
    expect(scrollTopForShare(0.7, { scrollHeight: 300, clientHeight: 500 })).toBe(0);
  });
});
