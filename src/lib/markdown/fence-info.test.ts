import { describe, expect, it } from "vitest";

import { fenceInfoOfLine, fenceLanguage, parseFenceInfo, withFenceAttributes, withFenceLanguage } from "./fence-info";

describe("parseFenceInfo", () => {
  it("should read the language alone when the info string has no attributes", () => {
    expect(parseFenceInfo("mermaid")).toEqual({ language: "mermaid", view: null, caption: null, wrap: false });
    expect(parseFenceInfo("")).toEqual({ language: "", view: null, caption: null, wrap: false });
  });

  it("should read each view when the attribute names one", () => {
    expect(parseFenceInfo("mermaid {view=code}").view).toBe("code");
    expect(parseFenceInfo("mermaid {view=preview}").view).toBe("preview");
    expect(parseFenceInfo("mermaid {view=split}").view).toBe("split");
    expect(parseFenceInfo("mermaid {view=Split}").view).toBe("split");
    expect(parseFenceInfo('mermaid {view="split"}').view).toBe("split");
  });

  it("should ignore the view when its value is unknown", () => {
    expect(parseFenceInfo("mermaid {view=sideways}")).toEqual({ language: "mermaid", view: null, caption: null, wrap: false });
    expect(parseFenceInfo("mermaid {view=}").view).toBeNull();
  });

  it("should read a quoted caption with escaped quotes and backslashes", () => {
    expect(parseFenceInfo('mermaid {view=split caption="Say \\"hi\\" to C:\\\\ now"}')).toEqual({ language: "mermaid", view: "split", caption: 'Say "hi" to C:\\ now', wrap: false });
  });

  it("should read a caption that holds braces and equals signs", () => {
    expect(parseFenceInfo('ts {caption="a {b} = c"}')).toEqual({ language: "ts", view: null, caption: "a {b} = c", wrap: false });
  });

  it("should ignore unknown keys and keep the known ones", () => {
    expect(parseFenceInfo('mermaid {theme=dark view=code caption="Flow" data-x="1"}')).toEqual({ language: "mermaid", view: "code", caption: "Flow", wrap: false });
  });

  it("should read the first value when a key is written twice", () => {
    expect(parseFenceInfo("mermaid {view=code view=split}").view).toBe("code");
  });

  it("should ignore the whole block when it does not parse", () => {
    expect(parseFenceInfo('mermaid {view=split caption="open}')).toEqual({ language: "mermaid", view: null, caption: null, wrap: false });
    expect(parseFenceInfo("mermaid {view split}").view).toBeNull();
    expect(parseFenceInfo("mermaid {view=split} trailing").view).toBeNull();
    expect(parseFenceInfo("mermaid{view=split}").language).toBe("mermaid{view=split}");
  });

  it("should wrap only when wrap is true", () => {
    expect(parseFenceInfo("ts {wrap=true}").wrap).toBe(true);
    expect(parseFenceInfo("ts {wrap=TRUE}").wrap).toBe(true);
    expect(parseFenceInfo("ts {wrap=false}").wrap).toBe(false);
    expect(parseFenceInfo("ts {wrap=yes}").wrap).toBe(false);
  });

  it("should treat an empty caption as none", () => {
    expect(parseFenceInfo('mermaid {caption=""}').caption).toBeNull();
    expect(parseFenceInfo('mermaid {caption="   "}').caption).toBeNull();
  });

  it("should return an empty reading when the info is not a string", () => {
    expect(parseFenceInfo(null)).toEqual({ language: "", view: null, caption: null, wrap: false });
    expect(parseFenceInfo(42)).toEqual({ language: "", view: null, caption: null, wrap: false });
  });

  it("should keep the language word when other words follow it", () => {
    expect(fenceLanguage('js title="a.js" {view=code}')).toBe("js");
    expect(fenceLanguage("{view=code}")).toBe("");
  });
});

describe("withFenceAttributes", () => {
  it("should add an attribute block when there is none", () => {
    expect(withFenceAttributes("mermaid", { view: "split" })).toBe("mermaid {view=split}");
    expect(withFenceAttributes("mermaid", { view: "split", caption: "How it ships" })).toBe('mermaid {view=split caption="How it ships"}');
  });

  it("should replace a value in place and keep unknown pairs as written", () => {
    expect(withFenceAttributes('mermaid {theme=x view=code caption="A"}', { view: "split" })).toBe('mermaid {theme=x view=split caption="A"}');
  });

  it("should write wrap=true and remove it when wrapping is turned off", () => {
    expect(withFenceAttributes("ts", { wrap: true })).toBe("ts {wrap=true}");
    expect(withFenceAttributes("ts {wrap=true view=code}", { wrap: false })).toBe("ts {view=code}");
  });

  it("should drop the block when the last attribute is removed", () => {
    expect(withFenceAttributes("mermaid {view=split}", { view: null })).toBe("mermaid");
  });

  it("should escape quotes and backslashes and keep the caption on one line", () => {
    const info = withFenceAttributes("ts", { caption: 'Say "hi"\n to C:\\' });
    expect(info).toBe('ts {caption="Say \\"hi\\" to C:\\\\"}');
    expect(parseFenceInfo(info).caption).toBe('Say "hi" to C:\\');
  });

  it("should remove the caption when it is set to blank text", () => {
    expect(withFenceAttributes('ts {caption="A"}', { caption: "  " })).toBe("ts");
  });

  it("should write text as the language when a block without one gets an attribute", () => {
    expect(withFenceAttributes("", { caption: "Output" })).toBe('text {caption="Output"}');
  });

  it("should collapse a key written twice into one", () => {
    expect(withFenceAttributes("mermaid {view=code view=split}", { view: "preview" })).toBe("mermaid {view=preview}");
  });

  it("should leave a malformed block as text and add a fresh one after it", () => {
    const info = withFenceAttributes("mermaid {oops", { view: "code" });
    expect(info).toBe("mermaid {oops {view=code}");
    expect(parseFenceInfo(info).view).toBe("code");
  });
});

describe("withFenceLanguage", () => {
  it("should swap the language and keep the attributes", () => {
    expect(withFenceLanguage('mermaid {view=split caption="A"}', "ts")).toBe('ts {view=split caption="A"}');
  });

  it("should write text before the attributes when the language is cleared", () => {
    expect(withFenceLanguage('mermaid {caption="A"}', null)).toBe('text {caption="A"}');
    expect(withFenceLanguage("mermaid", null)).toBe("");
  });

  it("should keep other words after the language", () => {
    expect(withFenceLanguage('js title="a.js"', "ts")).toBe('ts title="a.js"');
  });
});

describe("fenceInfoOfLine", () => {
  it("should read the info string as written, escapes and all", () => {
    expect(fenceInfoOfLine('```mermaid {caption="Say \\"hi\\""}')).toBe('mermaid {caption="Say \\"hi\\""}');
    expect(fenceInfoOfLine("  ~~~~ ts ")).toBe("ts");
  });

  it("should return null when the line opens no fence", () => {
    expect(fenceInfoOfLine("    indented code")).toBeNull();
    expect(fenceInfoOfLine("``inline``")).toBeNull();
  });
});
