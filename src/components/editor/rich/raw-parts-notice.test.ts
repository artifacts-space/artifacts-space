import { describe, expect, it } from "vitest";

import { blockCorpus } from "./block-corpus";
import { parseMarkdown } from "./markdown-roundtrip";
import { rawPartsNotice } from "./raw-parts-notice";

const raw = blockCorpus.rawMarkdown?.samples ?? {};

describe("rawPartsNotice", () => {
  it("should name only the reasons in the document when every part has a known reason", () => {
    expect(rawPartsNotice(1, ["html"])).toBe("One part uses HTML, which this editor can’t format. It stays exactly as written.");
    expect(rawPartsNotice(3, ["footnote", "definition"])).toBe("3 parts use footnotes or link definitions, which this editor can’t format. They stay exactly as written.");
  });

  it("should stay general when the editor knows no reason for a part", () => {
    expect(rawPartsNotice(2, ["other"])).toBe("2 parts use Markdown this editor can’t format. They stay exactly as written.");
    expect(rawPartsNotice(2, ["other", "image"])).toBe("2 parts use Markdown this editor can’t format, such as images inside text. They stay exactly as written.");
  });

  it("should list three reasons with commas when there are three", () => {
    expect(rawPartsNotice(3, ["html", "footnote", "image"])).toContain("HTML, footnotes, or images inside text, which");
  });
});

describe("parseMarkdown raw kinds", () => {
  it("should report why each part stays as written when a document has raw parts", () => {
    expect(parseMarkdown(raw.rawHtml ?? "").rawKinds).toEqual(["html"]);
    expect(parseMarkdown(raw.footnotes ?? "").rawKinds).toEqual(["footnote"]);
    expect(parseMarkdown(raw.referenceLink ?? "").rawKinds).toEqual(["definition"]);
    expect(parseMarkdown(raw.imageInText ?? "").rawKinds).toEqual(["image"]);
    expect(parseMarkdown(raw.imageQuery ?? "").rawKinds).toEqual(["other"]);
  });

  it("should report no reasons when every part is formatted", () => {
    expect(parseMarkdown("# Plan\n\n- [ ] Ship\n").rawKinds).toEqual([]);
  });
});
