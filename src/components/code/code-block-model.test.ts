import { describe, expect, it } from "vitest";

import { codeBlockModel } from "./code-block-model";

describe("codeBlockModel", () => {
  it("should label the block with the language as given when one is set", () => {
    const model = codeBlockModel("x", "ts");
    expect(model.label).toBe("ts");
    expect(model.language).toBe("typescript");
  });

  it("should label the block text and skip highlighting when no language is set", () => {
    const model = codeBlockModel("x", undefined);
    expect(model.label).toBe("text");
    expect(model.language).toBeNull();
  });

  it("should keep the label but show plain text when the language is unknown", () => {
    const model = codeBlockModel("x", "klingon");
    expect(model.label).toBe("klingon");
    expect(model.language).toBeNull();
  });

  it("should copy the exact content when the code ends with a newline", () => {
    const code = "line one\n\tline two  \n";
    const model = codeBlockModel(code, "text");
    expect(model.copyValue).toBe(code);
    expect(model.display).toBe("line one\n\tline two  ");
  });

  it("should copy shell code without its prompts when lines start with one", () => {
    const model = codeBlockModel("$ pnpm install\n$ pnpm dev\n", "bash");
    expect(model.copyValue).toBe("pnpm install\npnpm dev\n");
    expect(model.display).toBe("$ pnpm install\n$ pnpm dev");
  });

  it("should copy other languages exactly when a line starts with a dollar sign", () => {
    expect(codeBlockModel("$ not a prompt", "text").copyValue).toBe("$ not a prompt");
  });
});
