import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { DocsH, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { LiveExample } from "@/components/docs/live-example";
import { componentGroups } from "@/lib/docs/components/catalog-docs";
import { dashboardExample, minimalExample } from "@/lib/docs/guide-examples";
import { docsMetadata } from "@/lib/docs/metadata";
import { componentHref } from "@/lib/docs/navigation";
import { docsHref } from "@/lib/docs/pages";
import { compactJson } from "@/lib/docs/spec-builders";
import { uiComponentNames } from "@/lib/ui/catalog";
import { uiLimits } from "@/lib/ui/limits";
import { UI_SPEC_VERSION } from "@/lib/ui/version";

export const metadata = docsMetadata("json-render");

const elementShape = compactJson({
  "kpi-revenue": {
    type: "Metric",
    props: { label: "Revenue", value: 1_284_000, format: "currency" },
    children: [],
    visible: { $state: "/showMoney" },
  },
});

const childrenShape = compactJson({
  page: { type: "Stack", props: { gap: "lg" }, children: ["title", "kpis"] },
  kpis: { type: "Grid", props: { columns: 3 }, children: ["kpi-revenue", "kpi-churn", "kpi-nps"] },
});

const stateShape = compactJson({ state: { showMoney: true, filters: { team: "Platform" }, services: [{ name: "api" }] } });

/** JSON Render overview: what a ui spec is and how it renders. */
export default function JsonRenderPage() {
  const page = "json-render" as const;
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="how" />
      <Prose>
        <p>
          A <code>ui</code> artifact is a <a href="https://github.com/vercel-labs/json-render">json-render</a> spec: one JSON object that names components and their props. artifacts.space renders it with its own component set, called <strong>stout</strong>, built on the same primitives as the rest of the site. The renderer is <code>@json-render/core</code> and <code>@json-render/react</code> 0.21.1.
        </p>
        <ol>
          <li>The agent reads the component guide with <code>artifacts_formats_guide</code> (<code>kind: &quot;ui&quot;</code>).</li>
          <li>It writes a spec and checks it with <code>artifacts_validate</code>. Every problem comes back at once, with the element key and the fix.</li>
          <li>It saves the spec with <code>artifacts_create</code> or <code>artifacts_update</code>. The server runs the same validation and refuses a spec with errors.</li>
          <li>Readers see a page that looks like the rest of artifacts.space, in light or dark, on any screen.</li>
        </ol>
        <p>
          Agent code never runs on the page. A spec is data: no scripts, no CSS, no network calls. Inputs such as Switch and Slider change only the page&apos;s own state, and nothing is saved or sent.
        </p>
      </Prose>

      <DocsH page={page} id="anatomy" />
      <Prose><p>Every spec has the same four top-level fields.</p></Prose>
      <DocsH page={page} id="version" />
      <Prose>
        <p>
          The component-set version the spec was written for. Always <code>{`"version": ${String(UI_SPEC_VERSION)}`}</code> today. Leaving it out is a warning; any other number is an error. When the component set changes in a way that alters existing props, the version goes up and older specs are migrated on read, so a saved page keeps its meaning.
        </p>
      </Prose>
      <DocsH page={page} id="root-elements" />
      <Prose>
        <p>
          <code>elements</code> is a <strong>flat map</strong> from a key you choose to one element. <code>root</code> names the top element. Each element has a <code>type</code> (a component name), <code>props</code>, and optionally <code>children</code>, <code>visible</code>, <code>repeat</code>, and <code>on</code>. Keys are up to {uiLimits.maxKeyLength} characters; short, readable keys such as <code>kpi-revenue</code> make validation messages easy to follow.
        </p>
      </Prose>
      <CodeBlock title="One element" value={elementShape} className="mt-4" />
      <DocsH page={page} id="children" />
      <Prose>
        <p>
          <code>children</code> lists child keys in order. Nesting comes from keys, not from nested objects, so a deep layout stays a flat, easy-to-edit list. Each element has exactly one parent, and the root has none. Only layout components (Section, Stack, Grid, Card, Tabs, Accordion) show children; a leaf with children gets a warning.
        </p>
      </Prose>
      <CodeBlock title="children" value={childrenShape} className="mt-4" />
      <DocsH page={page} id="state" />
      <Prose>
        <p>
          <code>state</code> is the page&apos;s starting data: any JSON object. Props read it with <code>$state</code>, inputs write it with <code>$bindState</code>, and <code>repeat</code> renders a list from an array in it. State lives in the reader&apos;s browser and resets on reload. See <Link href={docsHref("json-render/dynamic")}>Dynamic props and actions</Link>.
        </p>
      </Prose>
      <CodeBlock title="state" value={stateShape} className="mt-4" />

      <DocsH page={page} id="minimal" />
      <Prose><p>The smallest useful spec: a Stack with a heading and a paragraph.</p></Prose>
      <LiveExample example={minimalExample} />

      <DocsH page={page} id="dashboard" />
      <Prose><p>Metrics with sparklines, a stacked bar chart and a table in tabs, and a toggle that shows a callout. Copy the JSON, change the numbers, and it is yours.</p></Prose>
      <LiveExample example={dashboardExample} jsonOpen={false} />
      <Note title="Try it live">
        Open the <Link href={docsHref("json-render/playground")} className="underline underline-offset-2">playground</Link> to edit this dashboard and watch it re-render as you type.
      </Note>

      <DocsH page={page} id="catalog" />
      <Prose><p>The stout set has {uiComponentNames.length} components in six groups. Each page shows live examples and a props table generated from the schema the server checks against.</p></Prose>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {componentGroups.map((group) => (
          <div key={group.name} className="rounded-lg border px-4 py-3">
            <p className="text-md font-medium">{group.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{group.summary}</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {group.components.map((name) => <Link key={name} href={componentHref(name)} className="font-mono underline decoration-border underline-offset-4 hover:decoration-foreground">{name}</Link>)}
            </p>
          </div>
        ))}
      </div>
    </RegistryPage>
  );
}
