import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CopyCode } from "./copy-code";

describe("CopyCode", () => {
  const html = renderToStaticMarkup(<CopyCode value="https://artifacts.space/api/mcp" />);

  it("should be a button named for what it copies when it renders", () => {
    expect(html).toMatch(/^<button type="button" data-copy-code="" aria-label="Copy https:\/\/artifacts\.space\/api\/mcp"/);
    expect(html).toContain("<span>https://artifacts.space/api/mcp</span>");
  });

  it("should announce nothing until the value is copied", () => {
    expect(html).toContain('<span class="sr-only" aria-live="polite"></span>');
  });
});
