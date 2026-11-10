import { describe, expect, it } from "vitest";

import { withRelativeFileLinks } from "./own-file-links";

describe("withRelativeFileLinks", () => {
  const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const absolute = { content: `![Shot](https://artifacts.space/api/files/${fileId}#width=50)` };

  it("should save this site's absolute file links in the relative form when an agent re-saves the Markdown version", () => {
    expect(withRelativeFileLinks("markdown", absolute, "https://artifacts.space")).toEqual({ content: `![Shot](/api/files/${fileId}#width=50)` });
  });

  it("should leave other formats, and saves without content, as sent", () => {
    expect(withRelativeFileLinks("text", absolute, "https://artifacts.space")).toBe(absolute);
    const titleOnly: { title: string; content?: string } = { title: "Plan" };
    expect(withRelativeFileLinks("markdown", titleOnly, "https://artifacts.space")).toBe(titleOnly);
  });
});
