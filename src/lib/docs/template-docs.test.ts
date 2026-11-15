import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { templateCategoriesInUse, templatesIn, templateSources } from "@/lib/ui/templates/index";
import { templateCategoryNames } from "@/lib/ui/templates/types";

import { templateCategorySource, templateCategoryTitles } from "./template-docs";

describe("templateCategorySource", () => {
  it("should name a file that holds the id of every template in the category, for each category that has templates", () => {
    const wrong = templateCategoriesInUse().flatMap((category) => {
      const source = readFileSync(join(process.cwd(), templateCategorySource(category)), "utf8");
      return templatesIn(category).filter((template) => !source.includes(`id: "${template.id}"`)).map((template) => `${template.id} is not in ${templateCategorySource(category)}`);
    });
    expect(wrong).toEqual([]);
  });

  it("should point at a later file of a batch, not the batch's first, when a category's templates are written there", () => {
    const later = templateSources.filter((source) => source.name !== source.batch);
    expect(later.length).toBeGreaterThan(0);
    for (const source of later) {
      for (const template of source.templates) expect(templateCategorySource(template.category), template.id).toBe(`src/lib/ui/templates/${source.name}.ts`);
    }
  });

  it("should give every category a page title", () => {
    for (const category of templateCategoryNames) expect(templateCategoryTitles[category], category).toMatch(/\S/);
  });
});
