import { describe, expect, it } from "vitest";

import { pickerOptions } from "./picker-options";

const projects = [
  { id: "1", name: "Billing", icon: null, count: 3 },
  { id: "2", name: "Billing v2", icon: "🧾", count: 1 },
  { id: "3", name: "Docs", icon: null, count: 0 },
];

describe("pickerOptions", () => {
  it("should offer every project and nothing to create when nothing is typed", () => {
    expect(pickerOptions(projects, "  ")).toEqual({ matches: projects, create: null });
  });

  it("should match names without regard to case when text is typed", () => {
    expect(pickerOptions(projects, "BILL").matches.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("should put the exact match first and offer no create when a project has the name", () => {
    const options = pickerOptions(projects, "billing v2");
    expect(options.matches[0]?.id).toBe("2");
    expect(options.create).toBeNull();
  });

  it("should offer the normalized name to create when no project has it", () => {
    expect(pickerOptions(projects, "  New   launch ")).toEqual({ matches: [], create: "New launch" });
  });
});
