import { describe, expect, it } from "vitest";

import { scrollStopProps } from "./scroll-stop";

describe("scrollStopProps", () => {
  it("should add nothing when the box fits", () => {
    expect(scrollStopProps(false, { label: "typescript code" })).toEqual({});
    expect(scrollStopProps(false, { labelledBy: "caption-1" })).toEqual({});
  });

  it("should make a named, focusable group when the box scrolls", () => {
    expect(scrollStopProps(true, { label: "Command code" })).toEqual({ tabIndex: 0, role: "group", "aria-label": "Command code" });
  });

  it("should name the group by the element it points at when a caption names it", () => {
    expect(scrollStopProps(true, { labelledBy: "caption-1" })).toEqual({ tabIndex: 0, role: "group", "aria-labelledby": "caption-1" });
  });

  it("should never make a landmark region when the box scrolls", () => {
    const props: Record<string, unknown> = scrollStopProps(true, { label: "Owners" });
    expect(props.role).not.toBe("region");
  });
});
