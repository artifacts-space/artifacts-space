import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { CopyButton } from "@/components/copy-button";
import { DocsH, FactTable, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { ExamplePreview } from "@/components/docs/example-preview";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { compactJson } from "@/lib/docs/spec-builders";
import { templateFacts } from "@/lib/ui/templates/facts";
import { templatesByFile, uiTemplates } from "@/lib/ui/templates/index";
import { templateAsSpec } from "@/lib/ui/templates/instantiate";
import { templateBudget, templateFiles, type TemplateFile, type UiTemplate } from "@/lib/ui/templates/types";

export const metadata = docsMetadata("json-render/templates");

const fileTitles: Record<TemplateFile, string> = {
  nav: "Navigation, banners, and footers",
  heroes: "Heroes and calls to action",
  features: "Features, steps, numbers, and logos",
  pricing: "Pricing, comparison, and questions",
  social: "Testimonials, team, blog, and contact",
  app: "App screens",
};

const viewportWords = { fluid: "any width", wide: "desktop and tablet", phone: "phone" } as const;

const getCall = compactJson({ id: "pricing-three-tiers", prefix: "plans", as: "fragment" });

const fragmentShape = `{ "id": "pricing-three-tiers", "prefix": "plans",
  "slots": [ { "what": "Headline", "element": "plans-title", "prop": "text" },
             { "what": "Plans, each with name, monthly and yearly price, …", "state": "/plans/plans" } ],
  "attach": "Add fragment.elements to your spec's elements, add fragment.state's one key …",
  "fragment": { "root": "plans-pricing",
                "elements": { "plans-pricing": { "type": "Box", … }, "plans-title": { "type": "Heading", … }, … },
                "state": { "plans": { "yearly": false, "plans": [ … ] } } } }`;

const rules = [
  ["Size", `At most ${String(templateBudget.maxElements)} elements, nested at most ${String(templateBudget.maxDepth)} deep, so six or more fit in one spec.`],
  ["Lists", "A list (plans, links, features) lives in the template's state and is drawn by one repeat. Change the list, not the elements."],
  ["Words", "Placeholder copy, written for this set. No company names and no real logos."],
  ["Media", "Placeholder stands in for images, logos, video, and maps. A template needs no upload."],
  ["Links", "Links go nowhere, as in any mockup."],
  ["Style", "Only the component set's named steps: no CSS, no colors, no class names."],
];

/** One template: its name and id, what it is for, a copy button for its spec, and the template drawn live. */
function TemplateExample({ template }: { template: UiTemplate }) {
  const json = JSON.stringify(templateAsSpec(template), null, 2);
  const facts = templateFacts(template);
  return (
    <figure className="mt-6 min-w-0 overflow-hidden rounded-lg border" data-docs-template={template.id}>
      <figcaption className="border-b bg-muted/40 px-4 py-2">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium">{template.name}</span>
          <CopyButton value={json} label="Copy JSON" variant="ghost" size="sm" />
        </div>
        <p className="font-mono text-xs text-muted-foreground">{template.id} · {String(facts.elements)} elements · {viewportWords[template.viewport]}</p>
        <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
      </figcaption>
      <div className="min-w-0 bg-background" data-docs-preview="">
        <ExamplePreview json={json} />
      </div>
    </figure>
  );
}

/** What section templates are, how an agent uses them over MCP, and every template drawn live. */
export default function TemplatesPage() {
  const page = "json-render/templates" as const;
  return (
    <RegistryPage slug={page}>
      <Prose>
        <p>
          A mockup of a website or an app is mostly sections people have seen before: a navbar, a hero, three pricing plans, a sign-in screen. A <strong>section template</strong> is one of those, already drawn with the component set, so an agent starts from a section that works and spends its effort on your words.
        </p>
      </Prose>

      <DocsH page={page} id="what" />
      <Prose>
        <p>
          A template is a piece of a <Link href={docsHref("json-render")}>ui spec</Link>: a root element, the elements under it, and the state they read. It uses only components from the set, so it follows the artifact&apos;s theme, light and dark, and lays itself out by the width it is drawn at: the page, or a <Link href={docsHref("json-render", "canvas")}>canvas frame</Link>. Every template keeps the same rules.
        </p>
      </Prose>
      <FactTable head={["Rule", "What it means"]} rows={rules} mono={[]} />

      <DocsH page={page} id="use" />
      <Prose>
        <p>
          Two read-only tools hand templates out (<Link href={docsHref("mcp", "tools")}>MCP reference</Link>). <code>ui_templates_list</code> returns one small row per template, all of them or only one <code>category</code> or <code>kind</code>. <code>ui_template_get</code> returns one template, ready to use:
        </p>
      </Prose>
      <CodeSnippet title="ui_template_get" language="json" code={getCall} className="mt-4" />
      <CodeSnippet title="What comes back" language="json" code={fragmentShape} className="mt-4" />
      <Prose>
        <ul>
          <li><code>slots</code> names what to change: a prop of one element, or a value in the state, such as the list a repeat draws.</li>
          <li><code>as: &quot;fragment&quot;</code> (the default) is a piece to add to a spec the agent is building. <code>as: &quot;spec&quot;</code> is a complete ui spec: save it as a ui artifact, or use it as a canvas frame&apos;s <code>spec</code>.</li>
          <li><code>attach</code> says, in one sentence, how to use what came back.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="combine" />
      <Prose>
        <p>
          Every element key and state path of a template carries a prefix: the template&apos;s id, or the <code>prefix</code> the agent passes. Keys become <code>plans-title</code>, and the state moves under <code>/plans</code>. So a navbar, a hero, and a pricing section share one spec without a clash, and one template can be used twice under two prefixes. The spec form wraps the template in a root Box named <code>page</code>; further sections go into its <code>children</code>.
        </p>
      </Prose>

      <DocsH page={page} id="catalog" />
      <Prose>
        <p>
          {uiTemplates.length} templates today, drawn here by the same renderer an artifact uses. Each is shown at the width of this column; in a wider page or frame it spreads out.
        </p>
      </Prose>
      {templateFiles.filter((file) => templatesByFile[file].length > 0).map((file) => (
        <section key={file} aria-labelledby={`templates-${file}`} className="mt-10">
          {/* A level-2 heading: a template drawn below may carry its own level-1 heading, and the next group must not skip a level after it. */}
          <h2 id={`templates-${file}`} className="text-lg font-medium tracking-[-0.01em]">{fileTitles[file]}</h2>
          {templatesByFile[file].map((template) => <TemplateExample key={template.id} template={template} />)}
        </section>
      ))}
    </RegistryPage>
  );
}
