import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodeBlockToolbar, type CodeBlockToolbarProps } from "./code-block-toolbar";

const noop = () => undefined;
const base: CodeBlockToolbarProps = {
  language: "mermaid",
  code: "flowchart TD",
  editable: true,
  view: "split",
  wrap: false,
  captionShown: false,
  onLanguage: noop,
  onView: noop,
  onWrap: noop,
  onCaption: noop,
};

const render = (props: Partial<CodeBlockToolbarProps> = {}) => renderToStaticMarkup(<CodeBlockToolbar {...base} {...props} />);

describe("CodeBlockToolbar", () => {
  it("should put the language and view pickers before Copy, Wrap code, and Caption when the block is a diagram", () => {
    const html = render();
    const order = ['aria-label="Code language"', 'aria-label="Diagram view"', 'aria-label="Copy code"', 'aria-label="Wrap code"', 'aria-label="Caption"'].map((label) => html.indexOf(label));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Split");
  });

  it("should leave out the view picker when the block is plain code", () => {
    expect(render({ language: "ts", view: null })).not.toContain("Diagram view");
  });

  it("should mark Wrap code as pressed when the block wraps", () => {
    expect(render({ wrap: true })).toMatch(/aria-label="Wrap code" aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Wrap code"/u);
  });

  it("should hide the Caption button when the block already shows a caption", () => {
    expect(render({ captionShown: true })).not.toContain('aria-label="Caption"');
  });

  it("should offer only Copy when the editor is read-only", () => {
    const html = render({ editable: false });
    expect(html).toContain('aria-label="Copy code"');
    expect(html).not.toContain("Wrap code");
    expect(html).not.toContain('aria-label="Caption"');
  });
});
