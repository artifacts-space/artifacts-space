import { describe, expect, it } from "vitest";

import { maskSecret } from "./mask-secret";

describe("maskSecret", () => {
  it("should keep the prefix and last four characters when the secret has an underscore prefix", () => {
    expect(maskSecret("artifacts_Gr93qUUtVINyOaj0XKZafAA8jUULlL0K")).toBe("artifacts_********lL0K");
  });

  it("should show only the last four characters when there is no prefix", () => {
    expect(maskSecret("abcdefghijklmnopqrstuvwxyz")).toBe("********wxyz");
  });

  it("should ignore an underscore too far in to be a prefix", () => {
    expect(maskSecret("abcdefghijklmnopqrstu_vwxyz")).toBe("********wxyz");
  });

  it("should hide every character when the secret is short", () => {
    expect(maskSecret("short_secret")).toBe("********");
  });
});
