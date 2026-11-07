import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findHandRolledCards, isHandRolledCard } from "./card-surface-rules";

const sourceRoot = join(process.cwd(), "src");

function componentFiles(): string[] {
  return readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".tsx"))
    .map((path) => join(sourceRoot, path));
}

describe("isHandRolledCard", () => {
  it("should flag a rounded, bordered, card-colored surface with no shadow", () => {
    expect(isHandRolledCard("overflow-hidden rounded-md border bg-card")).toBe(true);
  });

  it("should pass the card-surface utility", () => {
    expect(isHandRolledCard("card-surface overflow-hidden")).toBe(false);
  });

  it("should pass a frame that chooses a shadow step on purpose", () => {
    expect(isHandRolledCard("rounded-md border bg-card shadow-xs")).toBe(false);
  });

  it("should pass a bordered element that is not card colored", () => {
    expect(isHandRolledCard("rounded-md border bg-muted/50 px-3")).toBe(false);
  });

  it("should not match partial class names such as border-t or bg-card/50", () => {
    expect(isHandRolledCard("rounded-md border-t bg-card/50")).toBe(false);
  });
});

describe("findHandRolledCards", () => {
  it("should return each offending class list when a file hand-writes cards", () => {
    const source = `<div className="rounded-lg border bg-card p-4" /><p className="text-sm" />`;
    expect(findHandRolledCards(source)).toEqual(["rounded-lg border bg-card p-4"]);
  });

  it("should find no hand-rolled cards when scanning the app's components", () => {
    const offenders = componentFiles().flatMap((file) => findHandRolledCards(readFileSync(file, "utf8")).map((classes) => `${file}: ${classes}`));
    expect(offenders).toEqual([]);
  });
});
