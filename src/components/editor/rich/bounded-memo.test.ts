import { describe, expect, it, vi } from "vitest";

import { boundedMemo } from "./bounded-memo";

describe("boundedMemo", () => {
  it("should compute a value once when the same key is asked again", () => {
    const memo = boundedMemo(100);
    const compute = vi.fn(() => "value");
    expect(memo("key", compute)).toBe("value");
    expect(memo("key", compute)).toBe("value");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("should drop the least recently used entry when the budget is exceeded", () => {
    const memo = boundedMemo(8);
    memo("a", () => "111");
    memo("b", () => "222");
    memo("a", () => "unused");
    memo("c", () => "333");
    const recompute = vi.fn(() => "new");
    expect(memo("a", recompute)).toBe("111");
    expect(memo("b", recompute)).toBe("new");
    expect(recompute).toHaveBeenCalledTimes(1);
  });

  it("should not keep an entry when it is larger than the whole budget", () => {
    const memo = boundedMemo(4);
    const compute = vi.fn(() => "too long");
    expect(memo("k", compute)).toBe("too long");
    expect(memo("k", compute)).toBe("too long");
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
