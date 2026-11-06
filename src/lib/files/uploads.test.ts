import { describe, expect, it } from "vitest";

import { storedObjectProblem } from "./uploads";

describe("storedObjectProblem", () => {
  const row = { size: 100, contentType: "image/png" };

  it("should accept an object with the requested size and type", () => {
    expect(storedObjectProblem(row, { size: 100, contentType: "image/png" })).toBeNull();
    expect(storedObjectProblem(row, { size: 100, contentType: "IMAGE/PNG; x=1" })).toBeNull();
  });

  it("should explain a size or type that does not match", () => {
    expect(storedObjectProblem(row, { size: 99, contentType: "image/png" })).toContain("99 bytes");
    expect(storedObjectProblem(row, { size: 100, contentType: "text/html" })).toContain("text/html");
    expect(storedObjectProblem(row, { size: 100, contentType: "" })).toContain("untyped");
  });
});
