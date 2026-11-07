import type { FormatKind } from "@/lib/artifact-formats";
import { formatDocs } from "@/lib/docs/format-docs";
import { docsExampleFiles, single, spec, type DocExample, type DocSpec } from "@/lib/docs/spec-builders";
import type { FileDto } from "@/lib/files/types";

/**
 * Static sample content for the /preview page. Most samples come from the
 * docs (src/lib/docs); the few written here fill gaps the docs leave, such
 * as every Button variant and a full "Checkout v2 rollout" interface.
 * Nothing here is user content and nothing is read from a database.
 */

/** Every Button variant side by side. The docs example shows only two. */
export const buttonVariantsExample: DocExample = {
  title: "Every variant",
  spec: single("Stack", { direction: "horizontal", gap: "sm" }, {
    primary: { type: "Button", props: { label: "Start rollout" } },
    outline: { type: "Button", props: { label: "Pause", variant: "outline" } },
    secondary: { type: "Button", props: { label: "Roll back", variant: "secondary" } },
    ghost: { type: "Button", props: { label: "View logs", variant: "ghost" } },
  }),
};

/** A realistic product-team dashboard that uses many components at once. */
export const checkoutRolloutSpec: DocSpec = spec(
  "page",
  {
    page: { type: "Stack", props: { gap: "lg" }, children: ["title", "summary", "kpis", "status", "trend", "stages", "owners"] },
    title: { type: "Heading", props: { text: "Checkout v2 rollout", level: 1 } },
    summary: { type: "Text", props: { text: "Checkout v2 is live for 25% of shoppers. Conversion is up and errors are flat, so the next step opens on Thursday.", tone: "muted" } },
    kpis: { type: "Grid", props: { columns: 3 }, children: ["kpi-conversion", "kpi-errors", "kpi-latency"] },
    "kpi-conversion": { type: "Metric", props: { label: "Conversion", value: 3.42, format: "percent", change: 0.31, goodDirection: "up" } },
    "kpi-errors": { type: "Metric", props: { label: "Payment errors", value: 0.18, format: "percent", change: -0.02, goodDirection: "down" } },
    "kpi-latency": { type: "Metric", props: { label: "p95 checkout time", value: 1.9, unit: "s", change: -0.4, goodDirection: "down" } },
    status: { type: "Callout", props: { tone: "success", title: "Ready for 50%", text: "Every guardrail held for 72 hours at 25%." } },
    trend: {
      type: "Chart",
      props: {
        type: "line",
        title: "Conversion by day",
        format: "percent",
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        series: [
          { name: "Checkout v2", values: [3.3, 3.38, 3.41, 3.45, 3.4, 3.47, 3.42] },
          { name: "Checkout v1", values: [3.1, 3.12, 3.09, 3.13, 3.11, 3.1, 3.11] },
        ],
      },
    },
    stages: {
      type: "Timeline",
      props: {
        items: [
          { title: "Staff only", time: "Oct 28", status: "done" },
          { title: "5% of shoppers", time: "Nov 1", status: "done" },
          { title: "25% of shoppers", time: "Nov 4", status: "current", description: "Watching payment errors by card network." },
          { title: "50% of shoppers", time: "Nov 13", status: "upcoming" },
        ],
      },
    },
    owners: {
      type: "Table",
      props: {
        caption: "Owners",
        columns: [
          { key: "area", label: "Area" },
          { key: "owner", label: "Owner" },
          { key: "share", label: "Traffic", align: "right", format: "percent" },
        ],
        rows: [
          { area: "Payments", owner: "Dana", share: 25 },
          { area: "Address form", owner: "Sam", share: 25 },
          { area: "Order summary", owner: "Ada", share: 100 },
        ],
      },
    },
  },
);

/** One format viewer sample. */
export interface FormatSample {
  format: FormatKind;
  content: string;
  language?: string;
}

const checkoutNotes = "Screenshots and the metrics export from the **Checkout v2** review on Nov 6.";

/** Content for each format viewer. Reuses the Formats docs examples, except ui and file. */
export const formatSamples: Record<FormatKind, FormatSample> = {
  markdown: { format: "markdown", content: formatDocs.markdown.example },
  code: { format: "code", content: formatDocs.code.example, language: "typescript" },
  text: { format: "text", content: formatDocs.text.example },
  json: { format: "json", content: formatDocs.json.example },
  csv: { format: "csv", content: formatDocs.csv.example },
  svg: { format: "svg", content: formatDocs.svg.example },
  mermaid: { format: "mermaid", content: formatDocs.mermaid.example },
  ui: { format: "ui", content: JSON.stringify(checkoutRolloutSpec) },
  file: { format: "file", content: checkoutNotes },
};

const [docsImage] = docsExampleFiles;

/**
 * Files the preview pretends to hold: the docs' two stand-ins (so Image and
 * File examples resolve) plus a spreadsheet that shows as a download card.
 */
export const previewFiles: readonly FileDto[] = [
  ...docsExampleFiles,
  { id: "3c1d9e57-8b20-4f6a-9d3e-2a7b5c0e8f14", filename: "checkout-v2-metrics.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 184_320, createdAt: "2026-11-06T00:00:00.000Z" },
];

/** The files a file artifact shows on the preview: an image and a spreadsheet, no PDF frame. */
export const previewFileArtifactFiles: readonly FileDto[] = previewFiles.filter((file) => file.id === docsImage.id || file.contentType.includes("spreadsheet"));
