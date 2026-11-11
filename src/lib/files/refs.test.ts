import { describe, expect, it } from "vitest";

import { fileRefsInContent } from "./refs";

const a = "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a";
const b = "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4b";

describe("fileRefsInContent", () => {
  it("should collect distinct Image and File ids when the content is a ui spec", () => {
    const spec = {
      version: 1,
      root: "s",
      elements: {
        s: { type: "Stack", props: {}, children: ["i", "f", "g", "t"] },
        i: { type: "Image", props: { file: a.toUpperCase(), alt: "x" } },
        f: { type: "File", props: { file: b } },
        g: { type: "File", props: { file: a } },
        t: { type: "Text", props: { text: a, file: b } },
      },
    };
    expect(fileRefsInContent("ui", JSON.stringify(spec))).toEqual([a, b]);
  });

  it("should collect every file a Markdown document embeds or links when the content is Markdown", () => {
    const markdown = `![Plan](/api/files/${a.toUpperCase()}#width=50 "Cap")\n\nSee [the deck](/api/files/${b}) and ![again](/api/files/${a}).`;
    expect(fileRefsInContent("markdown", markdown)).toEqual([a, b]);
  });

  it("should find nothing in other formats or unreadable specs", () => {
    expect(fileRefsInContent("markdown", a)).toEqual([]);
    expect(fileRefsInContent("text", `/api/files/${a}`)).toEqual([]);
    expect(fileRefsInContent("ui", "{ nope")).toEqual([]);
    expect(fileRefsInContent("ui", "[]")).toEqual([]);
  });
});
