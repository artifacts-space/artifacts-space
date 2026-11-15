import { describe, expect, it } from "vitest";

import { uiComponentNames } from "@/lib/ui/catalog";
import { templateCategoriesInUse } from "@/lib/ui/templates/index";

import { docsNavTree, docsNeighbors, docsReadingOrder, docsSearchIndex } from "./navigation";
import { docsHeading, docsPages } from "./pages";
import { searchDocs } from "./search";

describe("docs navigation", () => {
  it("should list every page once in reading order when building prev and next", () => {
    const hrefs = docsReadingOrder().map((link) => link.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toHaveLength(docsPages.length + uiComponentNames.length + templateCategoriesInUse().length);
  });

  it("should follow the templates index with a page for each category that has templates when reading forward", () => {
    const hrefs = docsReadingOrder().map((link) => link.href);
    const start = hrefs.indexOf("/docs/json-render/templates");
    const categories = templateCategoriesInUse();
    expect(categories.length).toBeGreaterThan(0);
    expect(hrefs.slice(start + 1, start + 1 + categories.length)).toEqual(categories.map((category) => `/docs/json-render/templates/${category}`));
    expect(docsNeighbors(`/docs/json-render/templates/${categories[0] ?? ""}`).previous?.href).toBe("/docs/json-render/templates");
  });

  it("should link the introduction to the quickstart when reading forward", () => {
    expect(docsNeighbors("/docs")).toEqual({ previous: null, next: { title: "Quickstart", href: "/docs/quickstart" } });
  });

  it("should follow the components index with the first component when reading forward", () => {
    expect(docsNeighbors("/docs/json-render/components").next?.title).toBe("Section");
  });

  it("should put every page in a sidebar section when building the tree", () => {
    const links = docsNavTree().sections.flatMap((section) => section.links);
    expect(links).toHaveLength(docsPages.length);
  });

  it("should keep heading ids unique on each page when anchors are built", () => {
    for (const page of docsPages) {
      const ids = page.headings.map((heading) => heading.id);
      expect(new Set(ids).size, page.slug || "introduction").toBe(ids.length);
    }
  });

  it("should throw for a heading the page does not list when a page asks for it", () => {
    expect(() => docsHeading("quickstart", "missing")).toThrow(/no heading/);
  });
});

describe("searchDocs", () => {
  const index = docsSearchIndex();

  it("should find a heading by its words when the query is part of the title", () => {
    const results = searchDocs(index, "agent tokens");
    expect(results.map((result) => result.href)).toContain("/docs/sharing#agent-tokens");
  });

  it("should rank an exact component name first when searching for it", () => {
    expect(searchDocs(index, "chart")[0]?.title).toBe("Chart");
  });

  it("should find a template category's page by the name of one of its templates when the query names it", () => {
    expect(searchDocs(index, "three tiers").map((result) => result.href)).toContain("/docs/json-render/templates/pricing");
  });

  it("should find MCP tools by name when the query names one", () => {
    expect(searchDocs(index, "artifacts_validate")[0]?.href).toBe("/docs/mcp#artifacts_validate");
  });

  it("should return nothing when the query is blank", () => {
    expect(searchDocs(index, "   ")).toEqual([]);
  });
});
