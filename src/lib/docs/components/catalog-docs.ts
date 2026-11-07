import { uiCatalog, uiComponentNames, type UiComponentName } from "@/lib/ui/catalog";
import { contentProps } from "@/lib/ui/props/content";
import { dataProps } from "@/lib/ui/props/data";
import { inputProps } from "@/lib/ui/props/input";
import { layoutProps } from "@/lib/ui/props/layout";
import { mediaProps } from "@/lib/ui/props/media";
import { planningProps } from "@/lib/ui/props/planning";

import { dataDocs, planningDocs } from "./data";
import { inputDocs, mediaDocs } from "./inputs-media";
import { contentDocs, layoutDocs } from "./layout-content";
import type { ComponentDoc } from "./types";


/**
 * Docs for every component in the stout catalog. The Record type makes a new
 * catalog component fail the typecheck until it has examples here.
 */
export const componentDocs: Record<UiComponentName, ComponentDoc> = { ...layoutDocs, ...contentDocs, ...dataDocs, ...planningDocs, ...inputDocs, ...mediaDocs };

/** A group of components, in catalog order. Groups follow the props modules in src/lib/ui/props. */
export interface ComponentGroup {
  name: string;
  summary: string;
  components: UiComponentName[];
}

const names = (props: object) => Object.keys(props) as UiComponentName[];

export const componentGroups: ComponentGroup[] = [
  { name: "Layout", summary: "Arrange other elements. Only these components show their children.", components: names(layoutProps) },
  { name: "Content", summary: "Headings, text, Markdown, code, and links.", components: names(contentProps) },
  { name: "Data", summary: "Tables, numbers, charts, and diagrams.", components: names(dataProps) },
  { name: "Planning", summary: "Read-only boards and calendars.", components: names(planningProps) },
  { name: "Inputs", summary: "Controls that change on-page state only.", components: names(inputProps) },
  { name: "Media", summary: "Uploaded images and files, by id.", components: names(mediaProps) },
];

/** The group a component belongs to. */
export function groupOf(name: UiComponentName): ComponentGroup {
  const group = componentGroups.find((item) => item.components.includes(name));
  if (!group) throw new Error(`Component "${name}" is in no group.`);
  return group;
}

/** The agent-facing description from the catalog, the same text artifacts_formats_guide sends. */
export function componentDescription(name: UiComponentName): string {
  return uiCatalog.data.components[name].description;
}

/** The URL slug of a component page, such as "key-value". */
export function componentSlug(name: UiComponentName): string {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

const bySlug = new Map(uiComponentNames.map((name) => [componentSlug(name), name]));

/** The component with this slug, or null. */
export function componentBySlug(slug: string): UiComponentName | null {
  return bySlug.get(slug) ?? null;
}

/** Components in catalog order, as the sidebar and prev/next see them. */
export const orderedComponents: UiComponentName[] = componentGroups.flatMap((group) => group.components);
