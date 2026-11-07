import { describe, expect, it } from "vitest";

import { artifactInputSchema, artifactUpdateSchema } from "./artifacts";

describe("artifact icon at the data layer", () => {
  it("should store the normalized icon when an update sends one", () => {
    expect(artifactUpdateSchema.parse({ icon: "❤" }).icon).toBe("❤️");
  });

  it.each([null, ""])("should store null when an update sends %j", (icon) => {
    expect(artifactUpdateSchema.parse({ icon }).icon).toBeNull();
  });

  it("should leave the icon alone when an update does not mention it", () => {
    expect("icon" in artifactUpdateSchema.parse({ title: "New" })).toBe(false);
  });

  it("should refuse an invalid icon when a person or agent sends one", () => {
    expect(artifactUpdateSchema.safeParse({ icon: "<b>hi</b>" }).success).toBe(false);
    expect(artifactInputSchema.safeParse({ title: "T", content: "c", icon: "two words" }).success).toBe(false);
  });

  it("should create without an icon when none is given", () => {
    expect(artifactInputSchema.parse({ title: "T", content: "c" }).icon).toBeUndefined();
  });
});
