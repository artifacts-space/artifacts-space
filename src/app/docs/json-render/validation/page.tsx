import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { minimalExample } from "@/lib/docs/guide-examples";
import { issueCodeDocs } from "@/lib/docs/issue-codes";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { playgroundSeeds } from "@/lib/docs/playground-seeds";
import { compactJson, spec } from "@/lib/docs/spec-builders";
import { validationReport } from "@/lib/mcp/format-tools";
import { blockingCodes } from "@/lib/ui/issues";
import { uiLimits } from "@/lib/ui/limits";
import { maxRenderedElements } from "@/lib/ui/validate-tree";

export const metadata = docsMetadata("json-render/validation");

const brokenSeed = playgroundSeeds.find((seed) => seed.broken);
const brokenJson = brokenSeed ? compactJson(brokenSeed.spec) : "{}";

const warningsSpec = spec("page", {
  page: { type: "Stack", props: { gap: "md", padding: "lg" }, children: ["title"] },
  title: { type: "Heading", props: { text: "Release notes" }, children: ["extra"] },
  extra: { type: "Text", props: { text: "Never shown." } },
  draft: { type: "Text", props: { text: "Not reachable from the root." } },
});
const withoutVersion = { root: warningsSpec.root, elements: warningsSpec.elements };

/** Real artifacts_validate output, computed when the docs are built. */
const reports = {
  valid: validationReport("ui", JSON.stringify(minimalExample.spec)),
  broken: validationReport("ui", JSON.stringify(brokenSeed?.spec ?? {})),
  warnings: validationReport("ui", JSON.stringify(withoutVersion)),
  notJson: validationReport("ui", '{ "version": 1, "root": "page", '),
};

const callExample = compactJson({ name: "artifacts_validate", arguments: { kind: "ui", content: JSON.stringify(minimalExample.spec) } });

const limitRows = [
  ["Spec size", `${uiLimits.maxSpecBytes.toLocaleString("en-US")} bytes of JSON`],
  ["Elements", String(uiLimits.maxElements)],
  ["Nesting depth", `${String(uiLimits.maxDepth)} levels, root is 1`],
  ["Items per repeat", String(uiLimits.maxRepeatItems)],
  ["Rendered elements", `${maxRenderedElements.toLocaleString("en-US")}, once repeats expand`],
  ["JSON nesting anywhere", `${String(uiLimits.maxJsonDepth)} levels`],
  ["Element key length", `${String(uiLimits.maxKeyLength)} characters`],
  ["Issues reported at once", `${String(uiLimits.maxReportedIssues)}, then a count of the rest`],
];

/** How ui specs are validated, with real messages computed from the validator. */
export default function ValidationPage() {
  const page = "json-render/validation" as const;
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="when" />
      <Prose>
        <ul>
          <li><strong>Before saving</strong>, when the agent calls <code>artifacts_validate</code>. Nothing is saved.</li>
          <li><strong>On save</strong>, in <code>artifacts_create</code>, <code>artifacts_update</code>, and the web editor. A spec with errors is refused with the same report.</li>
          <li><strong>While you type</strong>, in the web editor and the <Link href={docsHref("json-render/playground")}>playground</Link>.</li>
          <li><strong>On render</strong>, again, so a page never trusts what is stored. Props that hold dynamic values are checked once they resolve.</li>
        </ul>
        <p>All four use one function, <code>validateUiSpec</code> in <code>src/lib/ui/validate.ts</code>. It checks the JSON, the limits, the version, every element&apos;s props against its schema, cross-field rules, the element tree, events and actions, and json-render&apos;s own structural checks.</p>
      </Prose>

      <DocsH page={page} id="validate-tool" />
      <Prose><p>Agents should validate before every save. It costs one read call, reports every problem at once, and each line names the element and says how to fix it.</p></Prose>
      <CodeSnippet title="tools/call" language="json" code={callExample} wrap className="mt-4" />
      <CodeSnippet title="Result for a valid spec" code={reports.valid} wrap className="mt-4" />

      <DocsH page={page} id="errors-warnings" />
      <Prose>
        <ul>
          <li><strong>Errors</strong> stop a save. Most errors belong to one element: the page still renders, and that element shows a small notice in its place.</li>
          <li>Some errors stop the whole page from rendering, because there is no safe way to draw it: {[...blockingCodes].map((code, index) => <span key={code}>{index > 0 ? ", " : ""}<code>{code}</code></span>)}.</li>
          <li><strong>Warnings</strong> never stop a save: a missing <code>version</code>, unknown props (ignored), children on a leaf (hidden), and elements the root never reaches (ignored).</li>
        </ul>
      </Prose>

      <DocsH page={page} id="examples" />
      <Prose><p>Each block below is the exact text <code>artifacts_validate</code> returns, computed from the validator when these docs were built.</p></Prose>
      <CodeSnippet title="A spec with three mistakes" language="json" code={brokenJson} className="mt-4" />
      <CodeSnippet title="Report" code={reports.broken} wrap className="mt-4" />
      <CodeSnippet title="Warnings only: no version, an unknown prop, a leaf with children, an unreachable element" code={reports.warnings} wrap className="mt-6" />
      <CodeSnippet title="Not JSON" code={reports.notJson} wrap className="mt-6" />
      <Note title="Fix it yourself">
        The first block is the &quot;Broken: fix me&quot; seed in the <Link href={docsHref("json-render/playground")} className="underline underline-offset-2">playground</Link>. Fix each line and watch the page appear.
      </Note>

      <DocsH page={page} id="limits" />
      <FactTable head={["Limit", "Value"]} rows={limitRows} mono={[1]} />
      <Prose><p>Props have their own limits, such as 200 points per series or 500 table rows. Each component page lists them in its props table.</p></Prose>

      <DocsH page={page} id="codes" />
      <Prose>
        <p>Each issue has a <code>code</code>, a <code>severity</code>, a <code>message</code>, and usually an <code>elementKey</code>. Agents only need the message; the codes are stable names for tooling.</p>
      </Prose>
      <FactTable
        head={["Code", "Severity", "Stops the page", "Meaning"]}
        mono={[0]}
        rows={issueCodeDocs.map((item) => [item.code, item.severity, item.blocking ? "Yes" : "No", item.meaning])}
      />
      <Prose><p>json-render&apos;s own structural checks can add a few more codes; their messages name the element too.</p></Prose>
    </RegistryPage>
  );
}
