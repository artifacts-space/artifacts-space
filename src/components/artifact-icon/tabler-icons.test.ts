import { describe, expect, it } from "vitest";

import { tablerIconEntries } from "@/lib/artifact-icons";

import { tablerIconComponents } from "./tabler-icons";

describe("tablerIconComponents", () => {
  it("should have a component for every allowed name and nothing else", () => {
    expect(Object.keys(tablerIconComponents).sort()).toEqual(tablerIconEntries.map((item) => item.name).sort());
    for (const component of Object.values(tablerIconComponents)) expect(component).toBeTruthy();
  });
});
