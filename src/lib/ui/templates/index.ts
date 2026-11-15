import { appTemplates } from "./app";
import { appScreenTemplates } from "./app-2";
import { appMomentTemplates } from "./app-3";
import { templateFacts } from "./facts";
import { featureTemplates } from "./features";
import { heroTemplates } from "./heroes";
import { navTemplates } from "./nav";
import { pricingTemplates } from "./pricing";
import { socialTemplates } from "./social";
import { socialTemplatesMore } from "./social-2";
import { templateCategories, templateCategoryNames, templateFiles, type TemplateCategory, type TemplateFile, type TemplateKind, type TemplateViewport, type UiTemplate } from "./types";

/** One source file of templates: its name without the extension, the batch it belongs to, and the templates written in it. */
export interface TemplateSource {
  name: string;
  batch: TemplateFile;
  templates: readonly UiTemplate[];
}

/**
 * Every source file, in index order. The index is built from this list and
 * nothing else, so a template is in the index only together with the file
 * it is written in; a batch that outgrows one file adds an entry here. A
 * test reads each file and fails when it does not hold its templates' ids.
 */
export const templateSources: readonly TemplateSource[] = [
  { name: "nav", batch: "nav", templates: navTemplates },
  { name: "heroes", batch: "heroes", templates: heroTemplates },
  { name: "features", batch: "features", templates: featureTemplates },
  { name: "pricing", batch: "pricing", templates: pricingTemplates },
  { name: "social", batch: "social", templates: socialTemplates },
  { name: "social-2", batch: "social", templates: socialTemplatesMore },
  { name: "app", batch: "app", templates: appTemplates },
  { name: "app-2", batch: "app", templates: appScreenTemplates },
  { name: "app-3", batch: "app", templates: appMomentTemplates },
];

const inBatch = (batch: TemplateFile) => templateSources.filter((source) => source.batch === batch).flatMap((source) => source.templates);

/** Every template, by the batch it belongs to. A batch can span several source files. */
export const templatesByFile: Record<TemplateFile, readonly UiTemplate[]> = {
  nav: inBatch("nav"),
  heroes: inBatch("heroes"),
  features: inBatch("features"),
  pricing: inBatch("pricing"),
  social: inBatch("social"),
  app: inBatch("app"),
};

/** Every template, in file order. The MCP tools, the docs, the dev page, and the tests all read this list. */
export const uiTemplates: readonly UiTemplate[] = templateFiles.flatMap((file) => templatesByFile[file]);

const sourceNames = new Map(templateSources.flatMap((source) => source.templates.map((template) => [template.id, source.name] as const)));

/** The repository file a template is written in, from the repository root; undefined for a template that is not in the index. */
export function templateSourcePath(id: string): string | undefined {
  const name = sourceNames.get(id);
  return name === undefined ? undefined : `src/lib/ui/templates/${name}.ts`;
}

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
