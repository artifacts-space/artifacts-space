import { appTemplates } from "./app";
import { templateFacts } from "./facts";
import { featureTemplates } from "./features";
import { heroTemplates } from "./heroes";
import { navTemplates } from "./nav";
import { pricingTemplates } from "./pricing";
import { socialTemplates } from "./social";
import { templateCategories, templateCategoryNames, templateFiles, type TemplateCategory, type TemplateFile, type TemplateKind, type TemplateViewport, type UiTemplate } from "./types";

/** Every template, by the batch file it lives in. */
export const templatesByFile: Record<TemplateFile, readonly UiTemplate[]> = {
  nav: navTemplates,
  heroes: heroTemplates,
  features: featureTemplates,
  pricing: pricingTemplates,
  social: socialTemplates,
  app: appTemplates,
};

/** Every template, in file order. The MCP tools, the docs, the dev page, and the tests all read this list. */
export const uiTemplates: readonly UiTemplate[] = templateFiles.flatMap((file) => templatesByFile[file]);

/** The template with this id, or undefined. */
export function findTemplate(id: string): UiTemplate | undefined {
  return uiTemplates.find((template) => template.id === id);
}

/** The templates of one category, in index order. */
export function templatesIn(category: TemplateCategory): UiTemplate[] {
  return uiTemplates.filter((template) => template.category === category);
}

/** The categories that have at least one template, in category order. The docs and the e2e loop make one page per entry. */
export function templateCategoriesInUse(): TemplateCategory[] {
  const used = new Set(uiTemplates.map((template) => template.category));
  return templateCategoryNames.filter((category) => used.has(category));
}

/** Whether a template is a section of a marketing site or a screen of an app. It follows from the category. */
export function templateKind(template: UiTemplate): TemplateKind {
  return templateCategories[template.category].kind;
}

/** One row of the template list: enough to pick a template without opening it. */
export interface TemplateRow {
  id: string;
  name: string;
  category: TemplateCategory;
  kind: TemplateKind;
  description: string;
  viewport: TemplateViewport;
  /** How many elements it adds to a spec. */
  elements: number;
}

/** The list row of one template. */
export function templateRow(template: UiTemplate): TemplateRow {
  const { id, name, category, description, viewport } = template;
  return { id, name, category, kind: templateKind(template), description, viewport, elements: templateFacts(template).elements };
}

/** Template rows, all of them or only those of one category or kind. */
export function listTemplates(filter: { category?: TemplateCategory | undefined; kind?: TemplateKind | undefined } = {}): TemplateRow[] {
  return uiTemplates
    .filter((template) => (filter.category === undefined || template.category === filter.category) && (filter.kind === undefined || templateKind(template) === filter.kind))
    .map(templateRow);
}
