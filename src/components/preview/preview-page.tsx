import Link from "next/link";
import type { ReactNode } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { UiView } from "@/components/artifact-view/ui-view";
import type { PreviewComponentItem, PreviewFormatItem, PreviewGroup } from "@/lib/preview/catalog";
import { builtInPresets } from "@/lib/themes/resolve";

import { PreviewThemeProvider, PreviewThemeSwitcher } from "./preview-theme";
import { ThemePanel } from "./theme-panel";

/** The same content in a light panel and a dark panel: side by side on wide screens, stacked on phones. */
function ThemePair({ fileArtifact = false, children }: { fileArtifact?: boolean; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <ThemePanel theme="light" fileArtifact={fileArtifact}>{children}</ThemePanel>
      <ThemePanel theme="dark" fileArtifact={fileArtifact}>{children}</ThemePanel>
    </div>
  );
}

function ItemHeading({ id, title, detail }: { id: string; title: string; detail?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 className="text-lg font-medium tracking-tight">
        <a href={`#${id}`} className="hover:underline hover:underline-offset-4">{title}</a>
      </h3>
      {detail ? <span className="font-mono text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

function ComponentItem({ item }: { item: PreviewComponentItem }) {
  return (
    <section id={item.id} className="min-w-0 scroll-mt-20 space-y-4" data-preview-item={item.name}>
      <ItemHeading id={item.id} title={item.name} />
      {item.examples.map((example) => (
        <div key={example.title} className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">{example.title}</p>
          <ThemePair>
            <UiView content={JSON.stringify(example.spec)} />
          </ThemePair>
        </div>
      ))}
    </section>
  );
}

function FormatItem({ item }: { item: PreviewFormatItem }) {
  const { format, content, language } = item.sample;
  return (
    <section id={item.id} className="min-w-0 scroll-mt-20 space-y-4" data-preview-item={`format:${format}`}>
      <ItemHeading id={item.id} title={item.name} detail={format} />
      <ThemePair fileArtifact={format === "file"}>
        <ArtifactView kind={format} content={content} language={language} title={`${item.name} sample`} />
      </ThemePair>
    </section>
  );
}

function Group({ group }: { group: PreviewGroup }) {
  return (
    <section aria-labelledby={`${group.id}-title`} className="min-w-0 space-y-10 border-t pt-8 first-of-type:border-t-0 first-of-type:pt-2">
      <h2 id={group.id} className="scroll-mt-20 text-2xl font-medium tracking-tight">
        <a id={`${group.id}-title`} href={`#${group.id}`} className="hover:underline hover:underline-offset-4">{group.title}</a>
      </h2>
      {group.items.map((item) => (item.type === "component" ? <ComponentItem key={item.id} item={item} /> : <FormatItem key={item.id} item={item} />))}
    </section>
  );
}

/** Jump links by group, as a sticky chip row on phones and tablets. */
function MobileNav({ groups }: { groups: readonly PreviewGroup[] }) {
  return (
    <nav aria-label="Sections" className="sticky top-0 z-20 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 xl:hidden">
      <ul className="flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
        {groups.map((group) => (
          <li key={group.id} className="shrink-0">
            <a href={`#${group.id}`} className="block rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{group.title}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The sticky table of contents on wide screens: every group and every item. */
function SideNav({ groups }: { groups: readonly PreviewGroup[] }) {
  return (
    <nav aria-label="Table of contents" className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-48 shrink-0 overflow-y-auto overscroll-contain pb-6 xl:block">
      <ul className="space-y-5">
        {groups.map((group) => (
          <li key={group.id}>
            <a href={`#${group.id}`} className="text-sm font-medium hover:underline hover:underline-offset-4">{group.title}</a>
            <ul className="mt-1.5 space-y-0.5 border-l pl-3">
              {group.items.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="block py-0.5 text-sm text-muted-foreground hover:text-foreground">{item.name}</a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Every json-render component and every artifact format viewer, each shown
 * in a light and a dark panel, with static sample data only. The switcher at
 * the top applies each built-in theme preset to every panel.
 */
export function PreviewPage({ groups }: { groups: readonly PreviewGroup[] }) {
  const componentCount = groups.reduce((count, group) => count + group.items.filter((item) => item.type === "component").length, 0);
  return (
    <PreviewThemeProvider presets={[...builtInPresets().values()]}>
      <div className="mx-auto flex w-full max-w-7xl gap-10 px-4 pt-6 pb-24 sm:px-6 sm:pt-10">
        <SideNav groups={groups} />
        <main className="min-w-0 flex-1 space-y-10">
          <header className="space-y-4">
            <div className="space-y-2">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">artifacts.space</Link>
              <h1 className="text-3xl font-medium tracking-tight">Artifact preview</h1>
              <p className="max-w-[60ch] text-md text-muted-foreground">
                See all {componentCount} components and every format in light and dark, side by side. Pick a theme to see every panel in it. Everything here is sample data.
              </p>
            </div>
            <PreviewThemeSwitcher />
          </header>
          <MobileNav groups={groups} />
          {groups.map((group) => <Group key={group.id} group={group} />)}
        </main>
      </div>
    </PreviewThemeProvider>
  );
}
