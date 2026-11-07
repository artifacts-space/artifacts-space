import { toolAccess } from "@/lib/mcp/tool-access";
import type { UiComponentName } from "@/lib/ui/catalog";

import { componentDescription, componentGroups, componentSlug, orderedComponents } from "./components/catalog-docs";
import { docsHref, docsPages, docsSections, type DocsSectionName } from "./pages";

/**
 * The docs as navigation: the sidebar tree, the reading order for prev/next
 * links, and the search index. Built from the page registry and the
 * component catalog, so a new page or component shows up everywhere at once.
 */

/** One link in the sidebar or in prev/next. */
export interface DocsLink {
  title: string;
  href: string;
}

/** A sidebar section with its pages. */
export interface DocsNavSection {
  name: DocsSectionName;
  links: DocsLink[];
}

/** A group of component links shown under "Components". */
export interface DocsNavGroup {
  name: string;
  links: DocsLink[];
}

/** Everything the sidebar needs, as plain data for a client component. */
export interface DocsNavTree {
  sections: DocsNavSection[];
  componentsHref: string;
  componentGroups: DocsNavGroup[];
}

/** The URL of a component's page. */
export function componentHref(name: UiComponentName): string {
  return docsHref(`json-render/components/${componentSlug(name)}`);
}

/** The sidebar: sections with their pages, plus the component groups. */
export function docsNavTree(): DocsNavTree {
  return {
    sections: docsSections.map((name) => ({
      name,
      links: docsPages.filter((page) => page.section === name).map((page) => ({ title: page.title, href: docsHref(page.slug) })),
    })),
    componentsHref: docsHref("json-render/components"),
    componentGroups: componentGroups.map((group) => ({ name: group.name, links: group.components.map((component) => ({ title: component, href: componentHref(component) })) })),
  };
}

/** Every page in reading order: component pages follow the components index. */
export function docsReadingOrder(): DocsLink[] {
  return docsPages.flatMap((page) => {
    const link = { title: page.title, href: docsHref(page.slug) };
    if (page.slug !== "json-render/components") return [link];
    return [link, ...orderedComponents.map((component) => ({ title: component, href: componentHref(component) }))];
  });
}

/** The pages before and after `href` in reading order. */
export function docsNeighbors(href: string): { previous: DocsLink | null; next: DocsLink | null } {
  const order = docsReadingOrder();
  const index = order.findIndex((link) => link.href === href);
  if (index === -1) return { previous: null, next: null };
  return { previous: order[index - 1] ?? null, next: order[index + 1] ?? null };
}

/** One search result: a page, a heading on a page, a component, or an MCP tool. */
export interface DocsSearchEntry {
  title: string;
  /** Where it sits, such as "Quickstart" or "Components · Data". */
  context: string;
  href: string;
  /** Extra words to match, never shown. */
  keywords: string;
  kind: "page" | "heading" | "component" | "tool";
}

function pageEntries(): DocsSearchEntry[] {
  return docsPages.flatMap((page) => [
    { title: page.title, context: page.section, href: docsHref(page.slug), keywords: page.description, kind: "page" as const },
    ...page.headings.map((heading) => ({ title: heading.title, context: page.title, href: docsHref(page.slug, heading.id), keywords: "", kind: "heading" as const })),
  ]);
}

function componentEntries(): DocsSearchEntry[] {
  return componentGroups.flatMap((group) =>
    group.components.map((component) => ({
      title: component,
      context: `Components · ${group.name}`,
      href: componentHref(component),
      keywords: componentDescription(component),
      kind: "component" as const,
    })),
  );
}

function toolEntries(): DocsSearchEntry[] {
  return Object.keys(toolAccess).map((name) => ({ title: name, context: "MCP reference", href: docsHref("mcp", name), keywords: "tool", kind: "tool" as const }));
}

/** The search index: page titles and headings, components, and MCP tools. */
export function docsSearchIndex(): DocsSearchEntry[] {
  return [...pageEntries(), ...componentEntries(), ...toolEntries()];
}
