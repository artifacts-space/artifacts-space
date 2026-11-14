import { describe, expect, it } from "vitest";

import { knownPageErrors } from "./known-page-errors";
import { allowanceCovers, consoleMessageKind, pageErrorReport, unexpectedPageErrors, type PageError } from "./page-error-rules";

const thrown: PageError = { kind: "pageerror", text: "TypeError: x is undefined", url: "http://localhost/app" };
const logged: PageError = { kind: "console.error", text: "Failed to load resource: 500", url: "http://localhost/api/x" };

describe("consoleMessageKind", () => {
  it("should report every console error", () => {
    expect(consoleMessageKind("error", "anything")).toBe("console.error");
  });

  it("should report a warning when it names a hydration mismatch", () => {
    expect(consoleMessageKind("warning", "A tree hydrated but some attributes did not match")).toBe("console.warning");
  });

  it("should ignore other warnings and lower levels", () => {
    expect(consoleMessageKind("warning", "deprecated option")).toBeNull();
    expect(consoleMessageKind("log", "hydrated")).toBeNull();
    expect(consoleMessageKind("info", "error")).toBeNull();
  });
});

describe("unexpectedPageErrors", () => {
  it("should keep every error when nothing is allowed", () => {
    expect(unexpectedPageErrors([thrown, logged], [])).toEqual([thrown, logged]);
  });

  it("should drop errors a string allowance contains", () => {
    expect(unexpectedPageErrors([thrown, logged], [{ pattern: "Failed to load resource", reason: "aborted on purpose" }])).toEqual([thrown]);
  });

  it("should drop errors a RegExp allowance matches, every time when the RegExp has the g flag", () => {
    const allowance = { pattern: /x is undefined/g, reason: "test" };
    expect(allowanceCovers(allowance, thrown)).toBe(true);
    expect(allowanceCovers(allowance, thrown)).toBe(true);
  });

  it("should drop a failed request when the allowance names its URL", () => {
    expect(unexpectedPageErrors([thrown, logged], [{ pattern: "/api/x", reason: "stubbed to fail" }])).toEqual([thrown]);
  });

  it("should keep an error when the allowance matches only a different error", () => {
    expect(unexpectedPageErrors([thrown], [{ pattern: /resource/, reason: "test" }])).toEqual([thrown]);
  });
});

describe("pageErrorReport", () => {
  it("should name each error with its kind and source", () => {
    const report = pageErrorReport([thrown, logged]);
    expect(report).toContain("2 unexpected errors");
    expect(report).toContain("1. pageerror (http://localhost/app): TypeError: x is undefined");
    expect(report).toContain("2. console.error (http://localhost/api/x): Failed to load resource: 500");
    expect(report).toContain("allowPageError");
  });

  it("should shorten a very long error text", () => {
    const report = pageErrorReport([{ kind: "console.error", text: "a".repeat(5_000), url: "" }]);
    expect(report).toContain("(4000 more characters)");
    expect(report.length).toBeLessThan(1_400);
  });
});

describe("knownPageErrors", () => {
  it("should give every allowed error a reason", () => {
    for (const allowance of knownPageErrors) expect(allowance.reason.trim().length).toBeGreaterThan(10);
  });
});
