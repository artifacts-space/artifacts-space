import { stackedBarExample, scatterExample } from "./chart-examples";
import { dataDocs, planningDocs } from "./components/data";
import { contentDocs } from "./components/layout-content";
import { dashboardExample, minimalExample, repeatExample } from "./guide-examples";
import { spec, type DocExample } from "./spec-builders";

/** A starting point in the playground. `broken` seeds fail validation on purpose. */
export interface PlaygroundSeed extends DocExample {
  id: string;
  broken?: boolean;
}

const brokenSpec = spec("page", {
  page: { type: "Stack", props: { gap: "md" }, children: ["title", "chart", "link", "widget", "notes"] },
  title: { type: "Heading", props: { text: "Fix me", level: 1 } },
  chart: { type: "Chart", props: { type: "line", labels: ["Mon", "Tue", "Wed", "Thu"], series: [{ name: "Deploys", values: [3, 5, 4] }] } },
  link: { type: "Link", props: { label: "Run this", href: "javascript:alert(1)" } },
  widget: { type: "Gauge", props: { value: 72 } },
  notes: { type: "Text", props: { text: "Read the issues under the editor, fix each one, and watch the page render." } },
});

const firstExample = (examples: DocExample[]) => {
  const [first] = examples;
  if (!first) throw new Error("A component doc has no examples.");
  return first;
};

/** Seeds in the order the picker shows them. */
export const playgroundSeeds: PlaygroundSeed[] = [
  { ...dashboardExample, id: "dashboard", title: "Dashboard" },
  { ...minimalExample, id: "minimal", title: "Minimal" },
  { ...firstExample(contentDocs.Steps.examples), id: "runbook", title: "Runbook" },
  { ...firstExample(planningDocs.Board.examples), id: "board", title: "Sprint board" },
  { ...firstExample(dataDocs.Table.examples), id: "table", title: "Table" },
  { ...stackedBarExample, id: "stacked", title: "Stacked bars" },
  { ...scatterExample, id: "scatter", title: "Scatter" },
  { ...repeatExample, id: "repeat", title: "State and repeat" },
  { title: "Broken: fix me", id: "broken", broken: true, spec: brokenSpec },
];
