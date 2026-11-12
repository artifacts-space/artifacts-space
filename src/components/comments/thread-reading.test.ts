import { describe, expect, it } from "vitest";

import { threadShows, threadTree } from "./thread-reading";

describe("threadTree", () => {
  it("should return the Markdown tree the thread renders when given a paragraph", () => {
    const tree = threadTree("Looks **good**");
    expect(tree.map((node) => node.type)).toEqual(["paragraph"]);
    expect(tree[0]?.children?.map((node) => node.type)).toEqual(["text", "strong"]);
  });
});

describe("threadShows", () => {
  it("should say the thread shows the box when the Markdown matches the nodes", () => {
    expect(threadShows("Looks good", [{ type: "paragraph", content: [{ type: "text", text: "Looks good" }] }])).toBe(true);
  });

  it("should say the thread differs when the Markdown adds a mark the box does not show", () => {
    expect(threadShows("*Looks good*", [{ type: "paragraph", content: [{ type: "text", text: "Looks good" }] }])).toBe(false);
  });
});
