import { describe, expect, it } from "vitest";

import { isLineBreakTag } from "./cell-breaks";

describe("isLineBreakTag", () => {
  it.each(["<br>", "<br/>", "<br />", "<BR>", " <br> "])("should read %j as a line break", (raw) => {
    expect(isLineBreakTag(raw)).toBe(true);
  });

  it.each(["<br class=x>", "<b>", "<br>x", "</br>", "<hr>", ""])("should not read %j as a line break", (raw) => {
    expect(isLineBreakTag(raw)).toBe(false);
  });
});
