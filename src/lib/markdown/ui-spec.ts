import { resolveElementProps, type VisibilityContext } from "@json-render/core";

import { isPlainObject, readPointer } from "@/lib/ui/json-walk";
import { uiLimits } from "@/lib/ui/limits";
import type { UiSpec } from "@/lib/ui/spec";
import { validateUiSpec } from "@/lib/ui/validate";

import { fenced } from "./text";
import { contentBlocks } from "./ui-blocks-content";
import { dataBlocks } from "./ui-blocks-data";
import type { BlockRenderer, FileLinkResolver } from "./ui-props";

/*
 * A readable Markdown rendering of a ui (json-render) spec, for agents that
 * fetch an artifact as Markdown. State bindings resolve to the spec's
 * initial state and repeats expand. Elements that a state condition hides
 * on the page are still written out, so a reader without the page's
 * controls (tabs, toggles) sees everything. Pure: no database, no network.
 */

/** Options for uiSpecToMarkdown. */
export interface UiMarkdownOptions {
  /** A link for an uploaded file id (Image and File components). Null when the file is not available to the reader. */
  fileLink?: FileLinkResolver;
}

const renderers: Record<string, BlockRenderer> = { ...contentBlocks, ...dataBlocks };

/** Most elements one rendering visits, repeats included, so a hostile spec cannot blow up the output. */
const maxVisits = 2000;

interface RepeatScope {
  item: unknown;
  index: number;
  basePath: string;
}

interface Walk {
  spec: UiSpec;
  state: Record<string, unknown>;
  fileLink: FileLinkResolver;
  visits: number;
}

function contextFor(walk: Walk, scope: RepeatScope | null) {
  const base: VisibilityContext = { stateModel: walk.state };
  if (!scope) return base;
  return { ...base, repeatItem: scope.item, repeatIndex: scope.index, repeatBasePath: scope.basePath };
}

function resolvedProps(props: Record<string, unknown>, context: VisibilityContext): Record<string, unknown> {
  try {
    return resolveElementProps(props, context);
  } catch {
    return props;
  }
}

/** The items a repeat renders, at most uiLimits.maxRepeatItems, or null when the element does not repeat. */
function repeatItems(walk: Walk, repeat: unknown): { items: unknown[]; path: string } | null {
  if (!isPlainObject(repeat) || typeof repeat.statePath !== "string") return null;
  const items = readPointer(walk.state, repeat.statePath);
  return { items: Array.isArray(items) ? items.slice(0, uiLimits.maxRepeatItems) : [], path: repeat.statePath };
}

function renderChildren(walk: Walk, keys: readonly string[], level: number, scope: RepeatScope | null, repeat: unknown): string[] {
  const repeated = repeatItems(walk, repeat);
  if (!repeated) return keys.flatMap((key) => renderElement(walk, key, level, scope));
  return repeated.items.flatMap((item, index) => {
    const itemScope = { item, index, basePath: `${repeated.path}/${String(index)}` };
    return keys.flatMap((key) => renderElement(walk, key, level, itemScope));
  });
}

/** Tabs and Accordion always write a heading per part; Section and Card only when they have a title. */
function writesHeading(type: string, props: Record<string, unknown>): boolean {
  if (type === "Tabs" || type === "Accordion") return true;
  return (type === "Section" || type === "Card") && typeof props.title === "string" && props.title.trim() !== "";
}

function renderElement(walk: Walk, key: string, level: number, scope: RepeatScope | null): string[] {
  const element = Object.hasOwn(walk.spec.elements, key) ? walk.spec.elements[key] : undefined;
  if (!element || walk.visits >= maxVisits) return [];
  walk.visits += 1;
  const context = contextFor(walk, scope);
  const renderer = renderers[element.type];
  if (!renderer) return [`_${element.type.replace(/[^\w ]/g, "")} component (not shown in Markdown)_`];
  const props = resolvedProps(element.props, context);
  const inner = writesHeading(element.type, props) ? level + 1 : level;
  return renderer({
    props,
    level,
    children: () => renderChildren(walk, element.children, inner, scope, element.repeat),
    child: (index) => {
      const childKey = element.children[index];
      return childKey ? renderElement(walk, childKey, inner, scope) : [];
    },
    fileLink: walk.fileLink,
  });
}

const bulletBlock = /^(?:- |\d+\. )/;

/** Joins blocks with blank lines, but keeps consecutive bullet blocks in one tight list. */
export function joinBlocks(blocks: readonly string[]): string {
  let out = "";
  let previous = "";
  for (const block of blocks) {
    if (block.trim() === "") continue;
    const separator = out === "" ? "" : bulletBlock.test(previous) && bulletBlock.test(block) && !previous.includes("\n\n") ? "\n" : "\n\n";
    out += separator + block;
    previous = block;
  }
  return out;
}

/**
 * Renders a ui artifact's JSON as Markdown: headings, text, and Markdown as
 * they are; tables as GitHub tables; metrics and key values as bullet
 * points; checklists as task lists; code and diagrams as fenced blocks;
 * charts as their data table; and a short note for anything else. A spec
 * that cannot be read comes back as its JSON in a fenced block.
 */
export function uiSpecToMarkdown(content: string, options: UiMarkdownOptions = {}): string {
  const result = validateUiSpec(content);
  if (!result.spec || !result.renderable) return `_This interface could not be read, so here is its source._\n\n${fenced(content, "json")}`;
  const walk: Walk = { spec: result.spec, state: result.spec.state ?? {}, fileLink: options.fileLink ?? (() => null), visits: 0 };
  return joinBlocks(renderElement(walk, result.spec.root, 2, null));
}
