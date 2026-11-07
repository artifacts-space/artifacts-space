import { describe, expect, it } from "vitest";
import { z } from "zod";

import { componentProps } from "@/lib/ui/catalog";

import { propRows, shapeRows } from "./prop-rows";

describe("propRows", () => {
  it("should list required and optional props with their limits when given a Card schema", () => {
    const rows = propRows(componentProps.Card);
    expect(rows).toEqual([
      { name: "title", type: "string", required: false, constraints: ["max 160 chars"], description: "", depth: 0 },
      { name: "description", type: "string", required: false, constraints: ["max 600 chars"], description: "", depth: 0 },
    ]);
  });

  it("should show enums as literal unions when a prop is an enum", () => {
    const type = propRows(componentProps.Chart).find((row) => row.name === "type");
    expect(type?.type).toBe('"bar" | "line" | "area" | "pie" | "donut" | "scatter"');
    expect(type?.required).toBe(true);
  });

  it("should nest array item properties under the parent when items are objects", () => {
    const names = propRows(componentProps.Table).map((row) => row.name);
    expect(names).toContain("columns[].key");
    expect(names).toContain("columns[].format");
    const key = propRows(componentProps.Table).find((row) => row.name === "columns[].key");
    expect(key?.depth).toBe(1);
  });

  it("should give integer ranges when a number has a minimum and maximum", () => {
    const columns = propRows(componentProps.Grid).find((row) => row.name === "columns");
    expect(columns).toMatchObject({ type: "integer", constraints: ["1–4"] });
  });

  it("should mark uuid strings when a prop is a file id", () => {
    expect(propRows(componentProps.Image).find((row) => row.name === "file")?.type).toBe("string (uuid)");
  });

  it("should read descriptions and defaults when given a raw tool shape", () => {
    const rows = shapeRows({ limit: z.number().int().min(1).max(100).optional().default(25).describe("How many") });
    expect(rows[0]).toMatchObject({ name: "limit", required: false, description: "How many" });
    expect(rows[0]?.constraints).toContain("default 25");
    expect(rows[0]?.constraints).toContain("1–100");
  });
});
