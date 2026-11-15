import { describe, expect, it } from "vitest";

import { CANVAS_VERSION, canvasMigrations, migrateCanvas } from "./version";

describe("migrateCanvas", () => {
  it("should return the canvas with the current version when it is already current", () => {
    const canvas = { version: CANVAS_VERSION, frames: [] };
    expect(migrateCanvas(canvas, CANVAS_VERSION)).toEqual(canvas);
  });

  it("should stamp the current version when the canvas had none", () => {
    expect(migrateCanvas({ frames: [] }, CANVAS_VERSION)).toEqual({ version: CANVAS_VERSION, frames: [] });
  });

  it("should have no migration steps while only version 1 exists", () => {
    expect(CANVAS_VERSION).toBe(1);
    expect(canvasMigrations).toEqual([]);
  });

  it("should have a step for every older version when the version moves on", () => {
    const from = canvasMigrations.map((step) => step.from).sort((a, b) => a - b);
    expect(from).toEqual(Array.from({ length: CANVAS_VERSION - 1 }, (_, index) => index + 1));
  });

  it("should run only the steps at or after the version given, in order", () => {
    const steps = [
      { from: 0, migrate: (canvas: Record<string, unknown>) => ({ ...canvas, trail: [...(canvas.trail as string[]), "zero"] }) },
      { from: -1, migrate: (canvas: Record<string, unknown>) => ({ ...canvas, trail: [...(canvas.trail as string[]), "minus one"] }) },
    ];
    expect(migrateCanvas({ trail: [] }, -1, steps)).toEqual({ version: CANVAS_VERSION, trail: ["minus one", "zero"] });
    expect(migrateCanvas({ trail: [] }, 0, steps)).toEqual({ version: CANVAS_VERSION, trail: ["zero"] });
  });
});
