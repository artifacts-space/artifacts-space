import { describe, expect, it } from "vitest";

import { remarkMentions } from "./remark-mentions";

const resolved = new Map([["charles", "person" as const]]);

function run(tree: object) {
  remarkMentions(resolved)()(tree as never);
  return tree;
}

describe("remarkMentions", () => {
  it("should turn a resolved handle in a paragraph into a mention span", () => {
    const tree = run({ type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Hi @charles!" }] }] });
    expect(tree).toEqual({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Hi " },
            { type: "mention", value: "@charles", data: { hName: "span", hProperties: { dataMention: "person", dataHandle: "charles" }, hChildren: [{ type: "text", value: "@charles" }] } },
            { type: "text", value: "!" },
          ],
        },
      ],
    });
  });

  it("should leave handles inside links untouched", () => {
    const link = { type: "link", url: "https://example.com", children: [{ type: "text", value: "@charles" }] };
    const tree = run({ type: "root", children: [{ type: "paragraph", children: [link] }] });
    expect(tree).toEqual({ type: "root", children: [{ type: "paragraph", children: [link] }] });
  });
});
