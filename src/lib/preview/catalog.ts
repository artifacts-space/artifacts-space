import { formatInfo, formatKinds, type FormatKind } from "@/lib/artifact-formats";
import { chartExamples } from "@/lib/docs/chart-examples";
import { componentDocs, componentGroups, componentSlug } from "@/lib/docs/components/catalog-docs";
import type { DocExample } from "@/lib/docs/spec-builders";
import type { UiComponentName } from "@/lib/ui/catalog";

import { buttonVariantsExample, formatSamples, type FormatSample } from "./samples";

/** The sections of the /preview page, in page order. */
export const previewGroupIds = ["layout", "text", "data", "interactive", "media", "formats"] as const;
export type PreviewGroupId = (typeof previewGroupIds)[number];

/** One component on the preview, with every example to show for it. */
export interface PreviewComponentItem {
  type: "component";
  /** Anchor id, such as "component-key-value". */
  id: string;
  name: UiComponentName;
  examples: DocExample[];
}

/** One format viewer on the preview. */
export interface PreviewFormatItem {
  type: "format";
  /** Anchor id, such as "format-csv". */
  id: string;
  name: string;
  sample: FormatSample;
}

export type PreviewItem = PreviewComponentItem | PreviewFormatItem;

export interface PreviewGroup {
  id: PreviewGroupId;
  title: string;
  items: PreviewItem[];
}

const groupTitles: Record<PreviewGroupId, string> = {
  layout: "Layout",
  text: "Text",
  data: "Data",
  interactive: "Interactive",
  media: "Media",
  formats: "Formats",
};

/** Where each docs component group lands on the preview. */
const docsGroupToPreview: Record<string, PreviewGroupId | undefined> = {
  Layout: "layout",
  Content: "text",
  Data: "data",
  Planning: "data",
  Inputs: "interactive",
  Media: "media",
};

/** Docs examples, swapped or extended where the preview should show every variant. */
function examplesFor(name: UiComponentName): DocExample[] {
  if (name === "Chart") return chartExamples;
  const examples = componentDocs[name].examples;
  if (name === "Button") return [...examples, buttonVariantsExample];
  return examples;
}

function componentItem(name: UiComponentName): PreviewComponentItem {
  return { type: "component", id: `component-${componentSlug(name)}`, name, examples: examplesFor(name) };
}

function formatItem(format: FormatKind): PreviewFormatItem {
  return { type: "format", id: `format-${format}`, name: formatInfo[format].label, sample: formatSamples[format] };
}

/**
 * Every ui component, grouped as the page shows them, then every format
 * viewer. Throws when a docs group has no place on the page, so a new group
 * cannot be silently left out.
 */
export function previewGroups(): PreviewGroup[] {
  const groups = new Map<PreviewGroupId, PreviewItem[]>(previewGroupIds.map((id) => [id, []]));
  for (const docsGroup of componentGroups) {
    const target = docsGroupToPreview[docsGroup.name];
    if (!target) throw new Error(`Docs group "${docsGroup.name}" has no section on the preview page.`);
    groups.get(target)?.push(...docsGroup.components.map(componentItem));
  }
  groups.get("formats")?.push(...formatKinds.map(formatItem));
  return previewGroupIds.map((id) => ({ id, title: groupTitles[id], items: groups.get(id) ?? [] }));
}

/** The component names a set of groups shows, in page order. */
export function previewComponentNames(groups: readonly PreviewGroup[]): UiComponentName[] {
  return groups.flatMap((group) => group.items.flatMap((item) => (item.type === "component" ? [item.name] : [])));
}

/** The formats a set of groups shows, in page order. */
export function previewFormats(groups: readonly PreviewGroup[]): FormatKind[] {
  return groups.flatMap((group) => group.items.flatMap((item) => (item.type === "format" ? [item.sample.format] : [])));
}
