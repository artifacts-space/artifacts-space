"use client";

import Link from "next/link";
import { useMemo } from "react";

import { UiView } from "@/components/artifact-view/ui-view";
import { ScrollFrame } from "@/components/docs/scroll-frame";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useHydrated } from "@/components/use-hydrated";
import { templateFrameWidths, type TemplateFrameWidth } from "@/lib/ui/templates/frames";
import { templateCategoriesInUse, templatesIn, uiTemplates } from "@/lib/ui/templates/index";
import { templateAsSpec } from "@/lib/ui/templates/instantiate";
import type { UiTemplate } from "@/lib/ui/templates/types";

const frameWidthClass: Record<TemplateFrameWidth, string> = { 1440: "w-[1440px]", 768: "w-[768px]", 390: "w-[390px]" };

/**
 * Says the page has hydrated, for tests: the server leaves the mark out and
 * the browser adds it once React has taken over every template above it. A
 * scan that marks what it scans would otherwise write on HTML React has yet
 * to check.
 */
function ReadyMark() {
  return useHydrated() ? <span hidden data-templates-ready="" /> : null;
}

function TemplateSpecimen({ template }: { template: UiTemplate }) {
  const json = useMemo(() => JSON.stringify(templateAsSpec(template)), [template]);
  const titleId = `template-${template.id}`;
  return (
    <section data-template={template.id} aria-labelledby={titleId} className="mt-10">
      <h2 id={titleId} className="text-lg font-medium">{template.name}</h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{template.id} · {template.category} · {template.viewport}</p>
      <p className="mt-1 text-md text-muted-foreground">{template.description}</p>
      {templateFrameWidths[template.viewport].map((width) => (
        <ScrollFrame key={width} label={`${template.name} at ${String(width)} pixels`} className="mt-4 overflow-x-auto rounded-lg border">
          <div data-template-frame={width} className={frameWidthClass[width]}>
            <UiView content={json} />
          </div>
        </ScrollFrame>
      ))}
    </section>
  );
}

/** Which templates the page draws: one category's, one template, or none (the page then lists the categories). */
export interface TemplatesFilter {
  category: string | null;
  template: string | null;
}

function shownFor({ category, template }: TemplatesFilter): readonly UiTemplate[] {
  if (template !== null) return uiTemplates.filter((entry) => entry.id === template);
  return category === null ? [] : uiTemplates.filter((entry) => entry.category === category);
}

/** The categories that have templates, each a link to its page. Sixty templates at three widths are too many to draw at once. */
function CategoryList() {
  return (
    <ul className="mt-4 grid gap-2 sm:grid-cols-3" data-template-categories="">
      {templateCategoriesInUse().map((category) => (
        <li key={category}>
          <Link href={`/dev/templates?category=${category}`} className="card-surface card-hover flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="font-mono">{category}</span>
            <span className="text-muted-foreground">{templatesIn(category).length}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Development only: section templates drawn by the real renderer at the
 * widths they are made for, each in a frame of that exact width. The page
 * draws one category (`?category=`) or one template (`?template=`); with
 * neither it lists the categories. The templates e2e spec reads it, one
 * category at a time.
 */
export function TemplatesFixture({ filter }: { filter: TemplatesFilter }) {
  const shown = shownFor(filter);
  return (
    <main className="w-full px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center gap-3 py-4">
        <h1 className="text-base font-medium">Section templates</h1>
        <span className="text-xs text-muted-foreground">{shown.length} of {uiTemplates.length} · development only</span>
        <div className="ml-auto"><ThemeSwitcher /></div>
      </header>
      {filter.category === null && filter.template === null ? <CategoryList /> : null}
      {shown.map((template) => <TemplateSpecimen key={template.id} template={template} />)}
      <ReadyMark />
    </main>
  );
}
