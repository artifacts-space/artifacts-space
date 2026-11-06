import { describe, expect, it } from "vitest";

import {
  cleanHandleInput,
  handleCandidates,
  suggestHandle,
  suggestHandleFromEmail,
  toHandle,
  validateHandle,
} from "./handles";

describe("validateHandle", () => {
  it("should accept lowercase letters, numbers, and single hyphens", () => {
    expect(validateHandle("charles")).toBeNull();
    expect(validateHandle("team-42")).toBeNull();
    expect(validateHandle("a1")).toBeNull();
  });

  it("should reject a handle when it is too short or too long", () => {
    expect(validateHandle("a")).toMatch(/2 to 39/);
    expect(validateHandle("a".repeat(40))).toMatch(/2 to 39/);
    expect(validateHandle("a".repeat(39))).toBeNull();
  });

  it("should reject uppercase, spaces, and symbols", () => {
    expect(validateHandle("Charles")).toMatch(/lowercase/);
    expect(validateHandle("my team")).toMatch(/lowercase/);
    expect(validateHandle("dots.not.ok")).toMatch(/lowercase/);
  });

  it("should reject edge and doubled hyphens", () => {
    expect(validateHandle("-lead")).toMatch(/lowercase/);
    expect(validateHandle("trail-")).toMatch(/lowercase/);
    expect(validateHandle("two--hyphens")).toMatch(/lowercase/);
  });

  it("should reject reserved names when they clash with routes or scopes", () => {
    expect(validateHandle("new")).toMatch(/reserved/);
    expect(validateHandle("mine")).toMatch(/reserved/);
    expect(validateHandle("admin")).toMatch(/reserved/);
  });
});

describe("cleanHandleInput", () => {
  it("should trim and lowercase typed input", () => {
    expect(cleanHandleInput("  Charles ")).toBe("charles");
  });
});

describe("toHandle", () => {
  it("should map any text to the handle shape", () => {
    expect(toHandle("Jane.Doe+test")).toBe("jane-doe-test");
    expect(toHandle("--Octo__Cat--")).toBe("octo-cat");
    expect(toHandle("ünïcode")).toBe("n-code");
  });

  it("should trim a trailing hyphen left by truncation", () => {
    expect(toHandle("abcd-efgh", 5)).toBe("abcd");
  });
});

describe("suggestHandle", () => {
  it("should fall back to user when too little text is left", () => {
    expect(suggestHandle("!")).toBe("user");
    expect(suggestHandle("x")).toBe("user");
  });

  it("should avoid reserved names by adding a suffix", () => {
    expect(suggestHandle("admin")).toBe("admin-user");
  });

  it("should use the email local part when suggesting from an email", () => {
    expect(suggestHandleFromEmail("jane@example.com")).toBe("jane");
    expect(suggestHandleFromEmail("first.last@example.com")).toBe("first-last");
  });

  it("should leave room for a numeric suffix when the base is long", () => {
    expect(suggestHandle("a".repeat(60))).toHaveLength(32);
  });
});

describe("handleCandidates", () => {
  it("should list the base first and then numbered variants", () => {
    expect(handleCandidates("dev", 3)).toEqual(["dev", "dev-2", "dev-3"]);
  });

  it("should keep every candidate valid when the base is at the length limit", () => {
    const candidates = handleCandidates("a".repeat(39), 12);
    for (const candidate of candidates) expect(validateHandle(candidate)).toBeNull();
  });
});
