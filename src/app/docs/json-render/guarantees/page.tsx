import Link from "next/link";

import { DocsH, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { LiveExample } from "@/components/docs/live-example";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { spec } from "@/lib/docs/spec-builders";
import { uiLimits } from "@/lib/ui/limits";
import { UI_SPEC_VERSION } from "@/lib/ui/version";

export const metadata = docsMetadata("json-render/guarantees");

/** A spec with one broken element, saved before validation: the rest still renders. */
const isolationExample = {
  title: "One broken element, the rest still renders",
  note: "This spec would not pass validation, but if a stored page ever holds one like it, only the broken elements show a notice.",
  spec: spec("page", {
    page: { type: "Stack", props: { gap: "md" }, children: ["before", "chart", "metric", "after"] },
    before: { type: "Text", props: { text: "Elements around the broken ones render normally." } },
    chart: { type: "Chart", props: { type: "radar", labels: ["a"], series: [{ name: "x", values: [1] }] } },
    metric: { type: "Metric", props: { label: "Missing value" } },
    after: { type: "Badge", props: { label: "still here", tone: "success" } },
  }),
};

/** What the stout component set promises, and where in the code each promise is kept. */
export default function GuaranteesPage() {
  const page = "json-render/guarantees" as const;
  return (
    <RegistryPage slug={page}>
      <Prose>
        <p>
          &quot;Stout&quot; is the name of the component set behind <code>ui</code> artifacts. It is built so an agent cannot make a page that breaks, leaks, or looks out of place, and so a saved page keeps working as the site changes.
        </p>
      </Prose>

      <DocsH page={page} id="bounded" />
      <Prose>
        <p>
          Every string has a maximum length and every array a maximum size, from the props schemas in <code>src/lib/ui/props</code>. Numbers must be finite. Dates, time zones, and currency codes are checked as real values. The whole spec is capped at {uiLimits.maxSpecBytes.toLocaleString("en-US")} bytes and {uiLimits.maxElements} elements. A valid spec therefore has a known worst case, and the gallery tests every component at its limits: the longest text, the most rows, huge and negative numbers.
        </p>
      </Prose>

      <DocsH page={page} id="no-css" />
      <Prose>
        <p>
          There is no <code>style</code>, <code>className</code>, or color prop anywhere. Layout comes from Stack, Grid, Section, and Card; emphasis comes from <code>tone</code> (neutral, info, success, warning, danger) and chart colors from a fixed palette. Every color is a theme token, so a page always matches the site, and an agent cannot hide text, fake a sign-in form, or break the layout.
        </p>
      </Prose>

      <DocsH page={page} id="isolation" />
      <Prose>
        <p>
          Each element renders behind its own error boundary, and its props are checked again after dynamic values resolve. A problem in one element shows a small notice in its place; the rest of the page renders. Unknown component types render nothing. Only problems that make the whole page unsafe to draw, such as a missing root or a cycle, stop it.
        </p>
      </Prose>
      <LiveExample example={isolationExample} jsonOpen={false} />

      <DocsH page={page} id="versions" />
      <Prose>
        <p>
          A spec records the component-set version it was written for (now {UI_SPEC_VERSION}). Changes to the set are additive: new components and new optional props never change what an existing spec means. When a change must alter existing props, the version goes up and a migration step rewrites older specs on read (<code>src/lib/ui/version.ts</code>), so pages saved today keep their meaning.
        </p>
      </Prose>

      <DocsH page={page} id="safety" />
      <Prose>
        <ul>
          <li>No agent code runs. The renderer maps known component names to our own React components; there is no HTML, script, or eval path.</li>
          <li>Actions only change on-page state. Nothing can fetch, send, navigate, or save.</li>
          <li>Links allow only absolute <code>http</code>, <code>https</code>, and <code>mailto</code> URLs, and open in a new tab. Markdown skips raw HTML, and its images show as alt text.</li>
          <li>Images and files come only from uploads attached to the artifact, by id, through the same access check as the page. A spec cannot load anything from another site, so it cannot track readers.</li>
          <li>Mermaid diagrams render in strict mode and show as an image.</li>
          <li>State paths that could reach <code>__proto__</code>, <code>constructor</code>, or <code>prototype</code> are refused.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="themes" />
      <Prose>
        <p>
          Every component reads the page&apos;s color and font tokens. These come from the site&apos;s light and dark look, or from the artifact&apos;s own <Link href={docsHref("themes")}>theme</Link>. So a page follows the reader&apos;s light or dark choice and the artifact&apos;s theme with no work from the agent. Layouts adapt to the screen: Grid drops to one column on phones, horizontal Stacks wrap, wide tables and boards scroll inside themselves, and the month calendar becomes a list. Text uses the site&apos;s type scale, and inputs are real, keyboard-accessible controls. Try the theme switcher in the footer while you read the <Link href={docsHref("json-render/components")}>component pages</Link>.
        </p>
      </Prose>
    </RegistryPage>
  );
}
