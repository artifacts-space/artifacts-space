import { describe, expect, it } from "vitest";

import { markdownRequestFor, markdownRoutePath, prefersMarkdown } from "./negotiation";

const id = "1PdUWmyQHs9x2dGxYtZ8aR";

describe("prefersMarkdown", () => {
  it("should accept Markdown when the client asks for text/markdown", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html;q=0.5")).toBe(true);
    expect(prefersMarkdown("text/x-markdown")).toBe(true);
  });

  it("should keep HTML when the client sends a browser Accept header or a wildcard", () => {
    expect(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
  });

  it("should keep HTML when HTML is preferred over Markdown", () => {
    expect(prefersMarkdown("text/html, text/markdown;q=0.5")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
  });
});

describe("markdownRequestFor", () => {
  it("should strip the .md suffix from the id when the path ends in .md", () => {
    expect(markdownRequestFor("GET", `/artifact/${id}.md`, null)).toEqual({ publicId: id, via: "suffix" });
  });

  it("should ask for Markdown when the Accept header prefers it", () => {
    expect(markdownRequestFor("GET", `/artifact/${id}`, "text/markdown")).toEqual({ publicId: id, via: "accept" });
    expect(markdownRequestFor("HEAD", `/artifact/${id}/`, "text/markdown")).toEqual({ publicId: id, via: "accept" });
  });

  it("should leave the normal page alone when a browser loads it", () => {
    expect(markdownRequestFor("GET", `/artifact/${id}`, "text/html,*/*;q=0.8")).toBeNull();
  });

  it("should ignore other methods and other paths", () => {
    expect(markdownRequestFor("POST", `/artifact/${id}.md`, null)).toBeNull();
    expect(markdownRequestFor("GET", `/artifact/${id}/og/v1`, "text/markdown")).toBeNull();
    expect(markdownRequestFor("GET", `/threads/${id}.md`, null)).toBeNull();
    expect(markdownRequestFor("GET", "/artifact/%E0%A4%A.md", null)).toBeNull();
  });

  it("should build the internal route path when given an id, even an empty one", () => {
    expect(markdownRoutePath(id)).toBe(`/artifact/${id}/markdown`);
    expect(markdownRoutePath("")).toBe("/artifact/-/markdown");
  });
});
