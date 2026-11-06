import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PixelAvatar } from "./pixel-avatar";

describe("PixelAvatar", () => {
  it("should render the same markup when given the same seed", () => {
    const first = renderToStaticMarkup(<PixelAvatar seed="user-1" size={32} />);
    expect(renderToStaticMarkup(<PixelAvatar seed="user-1" size={32} />)).toBe(first);
    expect(renderToStaticMarkup(<PixelAvatar seed="user-2" size={32} />)).not.toBe(first);
  });

  it("should announce the name when given a label", () => {
    const html = renderToStaticMarkup(<PixelAvatar seed="user-1" label="Ada Lovelace" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Ada Lovelace"');
    expect(html).not.toContain("aria-hidden");
  });

  it("should hide from screen readers when no label is given", () => {
    const html = renderToStaticMarkup(<PixelAvatar seed="user-1" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });

  it("should draw a circle for people and a rounded square for agents", () => {
    expect(renderToStaticMarkup(<PixelAvatar seed="user-1" />)).toContain("rounded-full");
    const agent = renderToStaticMarkup(<PixelAvatar seed="user-1" kind="agent" />);
    expect(agent).toContain("rounded-[25%]");
    expect(agent).toContain('data-avatar-kind="agent"');
  });

  it("should draw crisp pixels sized by the size prop", () => {
    const html = renderToStaticMarkup(<PixelAvatar seed="user-1" size={64} />);
    expect(html).toContain('width="64"');
    expect(html).toContain('viewBox="0 0 64 64"');
    expect(html).toContain('shape-rendering="crispEdges"');
  });
});
