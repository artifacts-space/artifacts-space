import { describe, expect, it } from "vitest";

import { boardLayoutVars } from "./board-layout";

describe("boardLayoutVars", () => {
  it("should share the width between columns when given the column count", () => {
    expect(boardLayoutVars(4)["--board-column"]).toContain("calc((100cqw - (4 - 1) * 0.75rem) / 4)");
  });

  it("should switch on the width the columns need at their minimum when they might not fit", () => {
    const vars = boardLayoutVars(5);
    expect(vars["--board-column"]).toContain("((5 * 12rem + (5 - 1) * 0.75rem) - 100cqw) * 1000");
    expect(vars["--board-fade"]).toBe("min(2rem, max(0px, calc(((5 * 12rem + (5 - 1) * 0.75rem) - 100cqw) * 1000)))");
  });

  it("should treat a count below one as one column when the count is out of range", () => {
    expect(boardLayoutVars(0)["--board-column"]).toContain("/ 1)");
  });
});
