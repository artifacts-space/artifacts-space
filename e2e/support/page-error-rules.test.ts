import { describe, expect, it } from "vitest";

import { knownPageErrors } from "./known-page-errors";
import {
  allowanceCovers,
  consoleMessageKind,
  listedErrorLimit,
  pageErrorReport,
  unexpectedPageErrors,
  type PageError,
} from "./page-error-rules";

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

  it("should list only the first errors and count the rest when a test logs hundreds", () => {
    const errors = Array.from({ length: 250 }, (_, index): PageError => ({ kind: "console.error", text: `error number ${String(index + 1)}`, url: "" }));
    const report = pageErrorReport(errors);
    expect(report).toContain("250 unexpected errors");
    expect(report).toContain(`${String(listedErrorLimit)}. console.error: error number ${String(listedErrorLimit)}`);
    expect(report).not.toContain(`error number ${String(listedErrorLimit + 1)}`);
    expect(report).toContain(`… and ${String(250 - listedErrorLimit)} more.`);
  });

  it("should not count more errors when every error is listed", () => {
    const errors = Array.from({ length: listedErrorLimit }, (): PageError => thrown);
    expect(pageErrorReport(errors)).not.toContain("more.");
  });

  it("should name each allowance in force with its pattern and reason when the test allowed some", () => {
    const report = pageErrorReport([thrown], [
      { pattern: "net::ERR_FAILED", reason: "The test aborts the route." },
      { pattern: /ChunkLoadError/i, reason: "The import fails for good." },
    ]);
    expect(report).toContain("Already allowed in this test:");
    expect(report).toContain(`- "net::ERR_FAILED": The test aborts the route.`);
    expect(report).toContain("- /ChunkLoadError/i: The import fails for good.");
  });

  it("should say nothing is allowed when the test allowed nothing", () => {
    expect(pageErrorReport([thrown], [])).toContain("Nothing is allowed in this test.");
  });
});

describe("knownPageErrors", () => {
  it("should give every allowed error a reason", () => {
    for (const allowance of knownPageErrors) expect(allowance.reason.trim().length).toBeGreaterThan(10);
  });
});
