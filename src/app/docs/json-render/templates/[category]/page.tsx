import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";

import { AnchorHeading, Prose } from "@/components/docs/docs-content";
import { DocsPage } from "@/components/docs/docs-page";
import { TemplateExample } from "@/components/docs/template-example";
import { docsHref, type DocsHeading } from "@/lib/docs/pages";
import { templateCategoryHref, templateCategorySource, templateCategoryTitles, templateKindTitles, templateViewportWords } from "@/lib/docs/template-docs";
import { templateFacts } from "@/lib/ui/templates/facts";
import { templateCategoriesInUse, templatesIn } from "@/lib/ui/templates/index";
import { templateAsSpec } from "@/lib/ui/templates/instantiate";
import { templateCategories, type TemplateCategory, type UiTemplate } from "@/lib/ui/templates/types";

type Params = PageProps<"/docs/json-render/templates/[category]">["params"];

/** One page per category that has templates, all built at build time. A category with none is a 404. */
export function generateStaticParams() {
  return templateCategoriesInUse().map((category) => ({ category }));
}

async function categoryFrom(params: Params): Promise<TemplateCategory | null> {
  const { category } = await params;
  return templateCategoriesInUse().find((name) => name === category) ?? null;
}

const leadOf = (category: TemplateCategory) => `The templates in the ${category} category, each drawn by the renderer an artifact uses.`;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const category = await categoryFrom(params);
  if (!category) return {};
  return { title: `${templateCategoryTitles[category]} · Section templates`, description: leadOf(category), alternates: { canonical: templateCategoryHref(category) } };
}

const headingOf = (template: UiTemplate): DocsHeading => ({ id: template.id, title: template.name, level: 2 });

/** One template: its name as a heading to link to, what it is for, and the template drawn live. Its spec is sent once. */
function TemplateEntry({ template }: { template: UiTemplate }) {
  return (
    <Fragment>
      <AnchorHeading heading={headingOf(template)} />
      <p className="mt-2 text-sm text-muted-foreground">{String(templateFacts(template).elements)} elements · {templateViewportWords[template.viewport]}</p>
      <Prose><p>{template.description}</p></Prose>
      <TemplateExample id={template.id} json={JSON.stringify(templateAsSpec(template))} />
    </Fragment>
  );
}

/** Holds the page's place while the category resolves on a client navigation. */
function CategorySkeleton() {
  return (
    <div className="max-w-[780px] animate-pulse pt-10" aria-hidden="true">
      <div className="h-4 w-40 rounded bg-muted" />
      <div className="mt-3 h-9 w-56 rounded bg-muted" />
      <div className="mt-5 h-12 rounded bg-muted" />
      <div className="mt-10 h-72 rounded-lg bg-muted" />
    </div>
  );
}

/** The templates of one category, drawn live. The index page lists every template without drawing any. */
export default function TemplateCategoryPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryTemplates params={params} />
    </Suspense>
  );
}

async function CategoryTemplates({ params }: { params: Params }) {
  const category = await categoryFrom(params);
  if (!category) notFound();
  const templates = templatesIn(category);
  return (
    <DocsPage
      href={templateCategoryHref(category)}
      eyebrow={`Section templates · ${templateKindTitles[templateCategories[category].kind]}`}
      title={templateCategoryTitles[category]}
      description={leadOf(category)}
      source={templateCategorySource(category)}
      headings={templates.map(headingOf)}
    >
      <Prose>
        <p>
          An agent fetches one with <code>ui_template_get</code> and the id shown above each, as a piece to add to a spec or as a complete spec. <Link href={docsHref("json-render/templates", "use")}>How templates work</Link>.
        </p>
      </Prose>
      {templates.map((template) => <TemplateEntry key={template.id} template={template} />)}
    </DocsPage>
  );
}
