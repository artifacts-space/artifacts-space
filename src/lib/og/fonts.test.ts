import { describe, expect, it } from "vitest";

import { ttfUrlFromCss } from "@/lib/og/fonts";

const css = `@font-face {
  font-family: 'Satoshi';
  src: url('//cdn.fontshare.com/wf/AAA/BBB/CCC.woff2') format('woff2'),
       url('//cdn.fontshare.com/wf/AAA/BBB/CCC.woff') format('woff'),
       url('//cdn.fontshare.com/wf/AAA/BBB/CCC.ttf') format('truetype');
  font-weight: 700;
}`;

describe("ttfUrlFromCss", () => {
  it("should return the https TTF url when the stylesheet lists one", () => {
    expect(ttfUrlFromCss(css)).toBe("https://cdn.fontshare.com/wf/AAA/BBB/CCC.ttf");
  });

  it("should return null when the stylesheet has no TTF", () => {
    expect(ttfUrlFromCss("src: url('//cdn.fontshare.com/a.woff2')")).toBeNull();
  });

  it("should return null when the TTF is on another host", () => {
    expect(ttfUrlFromCss("src: url('https://evil.example.com/a.ttf')")).toBeNull();
  });
});
