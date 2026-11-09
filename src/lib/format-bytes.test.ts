import { describe, expect, it } from "vitest";

import { binaryMegabytes, decimalMegabytes } from "./format-bytes";

describe("binaryMegabytes", () => {
  it("should read whole mebibytes as whole MB", () => {
    expect(binaryMegabytes(1_048_576)).toBe("1 MB");
    expect(binaryMegabytes(2_097_152)).toBe("2 MB");
  });

  it("should keep one decimal for a part", () => {
    expect(binaryMegabytes(1_572_864)).toBe("1.5 MB");
  });
});

describe("decimalMegabytes", () => {
  it("should read a million bytes as 1 MB", () => {
    expect(decimalMegabytes(1_000_000)).toBe("1 MB");
  });

  it("should not round a cap just under a million down to 0.9 MB", () => {
    expect(decimalMegabytes(990_000)).toBe("1 MB");
  });

  it("should keep one decimal for a part", () => {
    expect(decimalMegabytes(1_500_000)).toBe("1.5 MB");
  });
});
