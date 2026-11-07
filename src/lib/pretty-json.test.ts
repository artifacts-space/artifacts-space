import { describe, expect, it } from "vitest";

import { prettyJson } from "./pretty-json";

describe("prettyJson", () => {
  it("should indent with two spaces when the JSON parses", () => {
    expect(prettyJson('{ "service": "billing", "regions": ["eu-west-1"] }')).toBe('{\n  "service": "billing",\n  "regions": [\n    "eu-west-1"\n  ]\n}');
  });

  it("should return null when the JSON does not parse", () => {
    expect(prettyJson("{ nope")).toBeNull();
  });
});
