import { describe, expect, it } from "vitest";

import { diffableContent } from "./diff-text";

describe("diffableContent", () => {
  it("should pretty-print JSON and ui specs when they parse", () => {
    expect(diffableContent("ui", '{"root":"a","elements":{}}')).toBe('{\n  "root": "a",\n  "elements": {}\n}\n');
    expect(diffableContent("json", "[1,2]")).toBe("[\n  1,\n  2\n]\n");
  });

  it("should keep content as written when it does not parse or is not JSON", () => {
    expect(diffableContent("json", "{oops")).toBe("{oops");
    expect(diffableContent("markdown", '{"a":1}')).toBe('{"a":1}');
  });
});
