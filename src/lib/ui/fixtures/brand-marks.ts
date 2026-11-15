import { brandMarkLabels, brandUiIconNames } from "../icon-names";

const sizes = ["xs", "sm", "md", "lg", "xl"] as const;

interface Element {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
}

/** One row of marks at one size, as [key, element] pairs: the row, then each mark in it. */
function rowEntries(size: (typeof sizes)[number]): [string, Element][] {
  const row: [string, Element] = [`row-${size}`, { type: "Box", props: { direction: "horizontal", wrap: true, gap: "md", align: "center" }, children: brandUiIconNames.map((name) => `${size}-${name}`) }];
  return [row, ...brandUiIconNames.map((name): [string, Element] => [`${size}-${name}`, { type: "Icon", props: { name, size, label: brandMarkLabels[name] } }])];
}

/**
 * Every brand mark at every size an Icon has: one wrapping row per size, each
 * mark named by its brand, for the gallery's accessibility scan and the
 * contrast scan in light and in dark.
 */
export const brandMarksSpec: { version: number; root: string; elements: Record<string, Element> } = {
  version: 1,
  root: "page",
  elements: {
    page: { type: "Box", props: { gap: "md", padding: "md", label: "Brand marks" }, children: sizes.map((size) => `row-${size}`) },
    ...Object.fromEntries(sizes.flatMap(rowEntries)),
  },
};
