import { describe, expect, it } from "vitest";

import { validateArtifactContent } from "@/lib/artifact-content";
import { pageContentPolicy, pageScriptHosts } from "@/lib/page-host/rules";

import { buildHtmlGuide } from "./guide";

const guide = buildHtmlGuide();

describe("buildHtmlGuide", () => {
  it("should name every host the page's policy lets scripts load from", () => {
    for (const host of pageScriptHosts) expect(guide).toContain(host.replace("https://", ""));
  });

  it("should name the font hosts only while the policy allows them", () => {
    const policy = pageContentPolicy("https://artifacts.space");
    expect(policy).toContain("https://fonts.googleapis.com");
    expect(policy).toContain("https://fonts.gstatic.com");
    expect(guide).toContain("fonts.googleapis.com");
    expect(guide).toContain("fonts.gstatic.com");
  });

  it("should end with an example that saves", () => {
    const example = guide.slice(guide.indexOf("<!doctype html>", guide.indexOf("Example")));
    expect(validateArtifactContent("html", example).valid).toBe(true);
  });

  it("should load nothing in its example that the policy refuses", () => {
    const example = guide.slice(guide.indexOf("Example"));
    expect(example).not.toMatch(/src=|href=|url\(|fetch\(/);
  });
});
