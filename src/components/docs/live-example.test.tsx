import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ExampleSource } from "./live-example";

// The docs render on the server, where `#syntax-highlight` is the real highlighter.
vi.mock("#syntax-highlight", () => import("@/lib/syntax/highlight-server"));
vi.mock("./example-preview", () => ({ ExamplePreview: () => null }));

const json = JSON.stringify({ version: 1, root: "card", elements: { card: { type: "Card", props: { title: "Hello" } } } }, null, 2);

describe("ExampleSource", () => {
  it("should color the spec with the shared syntax tokens when it renders", () => {
    const html = renderToStaticMarkup(<ExampleSource title="Hello, artifacts" json={json} open />);
    expect(html).toContain('data-code-block=""');
    expect(html).toContain('class="text-syntax-property"');
    expect(html).toContain('class="text-syntax-string"');
    expect(html).toContain('class="text-syntax-number"');
  });

  it("should keep the spec highlighted when the toggle starts closed", () => {
    const html = renderToStaticMarkup(<ExampleSource title="Chart" json={json} open={false} />);
    expect(html).not.toContain("<details open");
    expect(html).toContain("text-syntax-string");
  });

});
