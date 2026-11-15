"use client";

import { useMemo, useSyncExternalStore } from "react";

import { UiView } from "@/components/artifact-view/ui-view";
import { ScrollFrame } from "@/components/docs/scroll-frame";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { uiTemplates } from "@/lib/ui/templates/index";
import { templateAsSpec } from "@/lib/ui/templates/instantiate";
import type { TemplateViewport, UiTemplate } from "@/lib/ui/templates/types";

/** The frame widths a template is drawn at, by the viewport it is made for: a desktop, a phone, or both. */
export const templateFrameWidths: Record<TemplateViewport, readonly (1440 | 390)[]> = { fluid: [1440, 390], wide: [1440], phone: [390] };

const frameWidthClass = { 1440: "w-[1440px]", 390: "w-[390px]" } as const;

const neverChanges = () => () => undefined;

/**
 * Says the page has hydrated, for tests: the server leaves the mark out and
 * the browser adds it once React has taken over every template above it. A
 * scan that marks what it scans would otherwise write on HTML React has yet
 * to check.
 */
function ReadyMark() {
  const hydrated = useSyncExternalStore(neverChanges, () => true, () => false);
  return hydrated ? <span hidden data-templates-ready="" /> : null;
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

/**
 * Development only: every section template drawn by the real renderer at the
 * widths it is made for, each in a frame of that exact width. `only` narrows
 * the page to one template. The templates e2e spec reads it.
 */
export function TemplatesFixture({ only }: { only: string | null }) {
  const shown = only === null ? uiTemplates : uiTemplates.filter((template) => template.id === only);
  return (
    <main className="w-full px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center gap-3 py-4">
        <h1 className="text-base font-medium">Section templates</h1>
        <span className="text-xs text-muted-foreground">{shown.length} of {uiTemplates.length} · development only</span>
        <div className="ml-auto"><ThemeSwitcher /></div>
      </header>
      {shown.map((template) => <TemplateSpecimen key={template.id} template={template} />)}
      <ReadyMark />
    </main>
  );
}
