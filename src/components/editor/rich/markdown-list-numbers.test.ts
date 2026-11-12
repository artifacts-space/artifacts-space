import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { edit, find, paragraph, setText } from "./list-edit-helpers";
import { withNumber } from "./markdown-list-numbers";

function firstList(doc: JSONContent): JSONContent {
  const list = (doc.content ?? []).find((node) => node.type === "orderedList");
  if (!list) throw new Error("No numbered list");
  return list;
}

/** Adds an item with `text` at `position` of the first numbered list. */
function addAt(markdown: string, position: number, text: string): string {
  return edit(markdown, (doc) => { firstList(doc).content?.splice(position, 0, { type: "listItem", content: [paragraph(text)] }); });
}

function removeAt(markdown: string, position: number): string {
  return edit(markdown, (doc) => { firstList(doc).content?.splice(position, 1); });
}

describe("numbered lists after items are added, removed, or moved", () => {
  it("should number the list again when an item is added in the middle or at the start", () => {
    expect(addAt("1. a\n2. b\n3. c\n", 1, "new")).toBe("1. a\n2. new\n3. b\n4. c\n");
    expect(addAt("1. a\n2. b\n3. c\n", 0, "new")).toBe("1. new\n2. a\n3. b\n4. c\n");
  });

  it("should number the list again when an item is removed", () => {
    expect(removeAt("1. a\n2. b\n3. c\n", 1)).toBe("1. a\n2. c\n");
    expect(removeAt("1. a\n2. b\n3. c\n", 0)).toBe("1. b\n2. c\n");
  });

  it("should number the list again when an item is moved", () => {
    const moved = edit("1. a\n2. b\n3. c\n", (doc) => {
      const items = firstList(doc).content ?? [];
      const [last] = items.splice(2, 1);
      if (last) items.unshift(last);
    });
    expect(moved).toBe("1. c\n2. a\n3. b\n");
  });

  it("should keep the start number, the delimiter, and one number for every item when the list had them", () => {
    expect(addAt("3) a\n4) b\n", 1, "new")).toBe("3) a\n4) new\n5) b\n");
    expect(addAt("1. a\n1. b\n", 1, "new")).toBe("1. a\n1. new\n1. b\n");
    expect(removeAt("1. a\n1. b\n1. c\n", 1)).toBe("1. a\n1. c\n");
  });

  it("should keep the other numbers when only words in an item change", () => {
    const markdown = "1. a\n5. b\n9. c\n";
    expect(edit(markdown, (doc) => { setText(find(doc, "paragraph", "b"), "bee"); })).toBe("1. a\n5. bee\n9. c\n");
  });

  it("should move an item's other lines with its number when the number gets wider", () => {
    const markdown = `${Array.from({ length: 9 }, (_, index) => `${String(index + 1)}. step`).join("\n")}\n10. Run:\n\n    \`\`\`sh\n    pnpm i\n    \`\`\`\n`;
    const saved = removeAt(markdown, 0);
    expect(saved).toContain("9. Run:\n\n   ```sh\n   pnpm i\n   ```\n");
    expect(withNumber("9. Run:\n\n   ```sh\n   x\n   ```", 10)).toBe("10. Run:\n\n    ```sh\n    x\n    ```");
  });
});
