import Link from "next/link";

import { DocsH, FactTable, InlineCodeText, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { LiveExample } from "@/components/docs/live-example";
import { areaExample, barExample, donutExample, formatsExample, gapsExample, groupedExample, lineExample, pieExample, scatterExample, stackedAreaExample, stackedBarExample } from "@/lib/docs/chart-examples";
import { docsMetadata } from "@/lib/docs/metadata";
import { componentHref } from "@/lib/docs/navigation";
import { maxPieSlices } from "@/lib/ui/chart-pie";
import { formatNumber } from "@/lib/ui/number-format";
import { chartCheck, chartTypes, maxChartSeries } from "@/lib/ui/props/chart";

export const metadata = docsMetadata("json-render/charts");

/** Real formatter output, so the table shows exactly what readers see. */
const formatRows: string[][] = [
  ["number", "1234.5", formatNumber(1234.5), "Plain numbers. Up to two decimals; whole numbers show none."],
  ["compact", "1250000", formatNumber(1_250_000, "compact"), "Short form for big numbers. Values under 1 use the plain rules."],
  ["percent", "12.5", formatNumber(12.5, "percent"), "The value is already a percent: 12.5 shows as 12.5%, not 1,250%."],
  ["currency", "28.5", formatNumber(28.5, "currency"), "Uses `currency` (default USD) and its minor unit."],
  ["currency (JPY)", "1200", formatNumber(1200, "currency", "JPY"), "Yen has no minor unit, so no decimals."],
  ["currency, sub-cent", "0.0042", formatNumber(0.0042, "currency"), "Smaller than one cent keeps two significant digits, never $0.00."],
  ["currency, huge", "2e15", formatNumber(2e15, "currency"), "From 10¹⁵ up, numbers switch to scientific notation."],
];

/** The real refusal for one broken chart, so the docs quote what agents get. */
const mismatch = chartCheck({ type: "line", labels: ["Mon", "Tue", "Wed", "Thu"], series: [{ name: "Deploys", values: [3, 5, 4] }] })[0] ?? "";
const pieTwoSeries = chartCheck({ type: "pie", labels: ["a", "b"], series: [{ name: "x", values: [1, 2] }, { name: "y", values: [3, 4] }] })[0] ?? "";
const stackedLine = chartCheck({ type: "line", stacked: true, labels: ["a"], series: [{ name: "x", values: [1] }] })[0] ?? "";
const scatterValues = chartCheck({ type: "scatter", series: [{ name: "Runs", values: [1, 2] }] })[0] ?? "";

/** Charts in depth: every type, stacking, formats, currency, and the rules. */
export default function ChartsPage() {
  const page = "json-render/charts" as const;
  return (
    <RegistryPage slug={page}>
      <Prose>
        <p>
          One component, <Link href={componentHref("Chart")}>Chart</Link>, draws {chartTypes.length} types: {chartTypes.map((type, index) => <span key={type}>{index > 0 ? ", " : ""}<code>{type}</code></span>)}. Up to {maxChartSeries} series, one per color in a fixed, validated palette with light and dark values. Every chart has a <strong>Table</strong> button that shows its data as a table, for screen readers and for exact numbers.
        </p>
      </Prose>

      <DocsH page={page} id="cartesian" />
      <Prose>
        <p><code>labels</code> are the x-axis. Each series has a <code>name</code> and one value per label in <code>values</code>. <code>height</code> is <code>sm</code>, <code>md</code> (default), or <code>lg</code>; <code>xLabel</code> and <code>yLabel</code> name the axes.</p>
      </Prose>
      <LiveExample example={barExample} jsonOpen={false} />
      <LiveExample example={lineExample} jsonOpen={false} />
      <LiveExample example={areaExample} jsonOpen={false} />

      <DocsH page={page} id="grouped" />
      <Prose><p>Several bar series draw grouped bars, side by side for each label.</p></Prose>
      <LiveExample example={groupedExample} jsonOpen={false} />

      <DocsH page={page} id="stacked" />
      <Prose><p><code>{'"stacked": true'}</code> stacks bar or area series. Negative values stack below zero, so gains and losses read in one bar.</p></Prose>
      <LiveExample example={stackedBarExample} jsonOpen={false} />
      <LiveExample example={stackedAreaExample} jsonOpen={false} />

      <DocsH page={page} id="gaps" />
      <Prose><p>Write <code>null</code> for a missing value. Lines and areas break there instead of guessing.</p></Prose>
      <LiveExample example={gapsExample} jsonOpen={false} />

      <DocsH page={page} id="pie" />
      <Prose>
        <p>Pie and donut take exactly one series. <code>labels</code> name the slices, and values must be zero or more. With more than {maxPieSlices} slices, the {maxPieSlices - 1} largest stay and the rest fold into one &quot;Other&quot; slice. The legend shows each slice&apos;s value and share; a donut shows the total in the middle.</p>
      </Prose>
      <LiveExample example={pieExample} jsonOpen={false} />
      <LiveExample example={donutExample} jsonOpen={false} />

      <DocsH page={page} id="scatter" />
      <Prose>
        <p>Scatter series carry <code>points</code> instead of <code>values</code>: <code>{'{ "x": 4, "y": 38, "label": "optional" }'}</code>, up to 500 per series, and the chart has no <code>labels</code>. <code>format</code> styles y values and <code>xFormat</code> styles x values. Keep to 3 series or fewer so the colors stay easy to tell apart.</p>
      </Prose>
      <LiveExample example={scatterExample} jsonOpen={false} />

      <DocsH page={page} id="formats" />
      <Prose><p><code>format</code> applies to values, axis ticks, tooltips, and the data table. The same rules format Metric, Table, and KeyValue numbers. Values read together, such as an axis or a column, share one decimal count so they line up.</p></Prose>
      <FactTable head={["format", "Value", "Shows as", "Notes"]} rows={formatRows.map(([format, value, shown, note]) => [format, value, shown, <InlineCodeText key="note" text={note ?? ""} />])} mono={[0, 1, 2]} />
      <LiveExample example={formatsExample} jsonOpen={false} />

      <DocsH page={page} id="currency" />
      <Prose>
        <ul>
          <li><code>currency</code> is a three-letter ISO 4217 code such as <code>USD</code>, <code>EUR</code>, or <code>JPY</code>. It applies only when <code>format</code> is <code>currency</code>, and defaults to USD.</li>
          <li>Amounts use the currency&apos;s minor unit: two decimals for USD and EUR ($28.50), none for JPY. Whole amounts drop the decimals ($1,430) unless others on the same axis need them.</li>
          <li>A code the browser does not know still renders, as <code>CODE 1,234</code>.</li>
          <li>For a Metric, <code>change</code> uses <code>changeFormat</code>, which defaults to the value&apos;s format. A revenue metric usually sets <code>changeFormat: &quot;percent&quot;</code> so a 12.4 change reads +12.4%, not +$12.40.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="rules" />
      <Prose><p>Validation checks the data shape for each type. These are the real messages:</p></Prose>
      <FactTable
        head={["Mistake", "Message"]}
        mono={[]}
        rows={[
          ["Fewer values than labels", mismatch],
          ["Two series on a pie", pieTwoSeries],
          ["stacked on a line chart", stackedLine],
          ["values on a scatter chart", scatterValues],
        ]}
      />
    </RegistryPage>
  );
}
