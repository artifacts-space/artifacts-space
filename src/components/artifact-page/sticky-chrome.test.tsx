import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHROME_HEIGHT_VAR, StickyChrome } from "./sticky-chrome";

describe("StickyChrome", () => {
  it("should pin its children to the top when rendered", () => {
    const html = renderToStaticMarkup(<StickyChrome><header>Logo</header></StickyChrome>);
    expect(html).toContain("<header>Logo</header>");
    expect(html).toMatch(/class="[^"]*\bsticky\b[^"]*\btop-0\b/);
  });

  it("should name the height variable the editor bar offsets by", () => {
    expect(CHROME_HEIGHT_VAR).toBe("--artifact-chrome-height");
  });
});
