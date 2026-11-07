import { describe, expect, it } from "vitest";

import { validateUiSpec } from "@/lib/ui/validate";

import { chartExamples } from "./chart-examples";
import { guideExamples } from "./guide-examples";
import { playgroundSeeds } from "./playground-seeds";

describe("guide examples", () => {
  it("should validate with no errors or warnings when checked like a saved artifact", () => {
    for (const example of [...guideExamples, ...chartExamples, ...playgroundSeeds.filter((seed) => !seed.broken)]) {
      expect(validateUiSpec(JSON.stringify(example.spec)).issues, example.title).toEqual([]);
    }
  });

  it("should fail validation when a playground seed is broken on purpose", () => {
    for (const seed of playgroundSeeds.filter((item) => item.broken)) {
      expect(validateUiSpec(JSON.stringify(seed.spec)).valid, seed.title).toBe(false);
    }
  });
});
