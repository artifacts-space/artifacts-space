import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReviewedFields } from "@/lib/versions/rules";

import { EditDiff } from "./edit-diff";

/* A pending theme change on the team page names the team's preset, not just "Team preset". */

const before: ReviewedFields = { title: "Plan", icon: null, theme: "paper", cover: null, summary: "", content: "Body", kind: "markdown", language: "", source: "", metadata: {} };
const after: ReviewedFields = { ...before, theme: "team:brand-abc123" };

describe("EditDiff theme row", () => {
  it("should name the team preset when the team page passes its preset names", () => {
    const html = renderToStaticMarkup(<EditDiff before={before} after={after} themeNames={new Map([["team:brand-abc123", "Acme brand"]])} />);
    expect(html).toContain("Paper");
    expect(html).toContain("Acme brand");
    expect(html).not.toContain("Team preset");
  });

  it("should fall back to Team preset when the name is not known", () => {
    expect(renderToStaticMarkup(<EditDiff before={before} after={after} />)).toContain("Team preset");
  });
});
