"use client";

import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore, type ReactNode } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { UiView } from "@/components/artifact-view/ui-view";
import { Button } from "@/components/ui/button";
import { uiComponentNames } from "@/lib/ui/catalog";
import { componentFixtures, fixtureSpec } from "@/lib/ui/fixtures/components";
import { exampleUiSpec } from "@/lib/ui/fixtures/example";
import { formatFixtures } from "@/lib/ui/fixtures/formats";
import { deepSpec, invalidPropsSpec, javascriptLinkSpec, manyElementsSpec, repeatSpec, unknownTypeSpec } from "@/lib/ui/fixtures/specs";

const specFixtures: { name: string; spec: unknown }[] = [
  { name: "Example", spec: exampleUiSpec },
  { name: "Unknown type", spec: unknownTypeSpec },
  { name: "Invalid props", spec: invalidPropsSpec },
  { name: "javascript: link", spec: javascriptLinkSpec },
  { name: "Repeat, 200 items", spec: repeatSpec(200) },
  { name: "Too many elements (501)", spec: manyElementsSpec(500) },
  { name: "Too deep (21)", spec: deepSpec(21) },
];

const themes = [
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
  { value: "system", label: "System", Icon: IconDeviceDesktop },
] as const;

const noSubscribe = () => () => undefined;

/** False during server render and hydration, true after, so theme-dependent UI cannot mismatch. */
function useMounted() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

function ThemeToggle() {
  const { theme: storedTheme, setTheme } = useTheme();
  const theme = useMounted() ? storedTheme : undefined;
  return (
    <div role="group" aria-label="Theme" className="flex rounded-md border p-0.5">
      {themes.map(({ value, label, Icon }) => (
        <Button key={value} variant={theme === value ? "secondary" : "ghost"} size="xs" aria-pressed={theme === value} onClick={() => { setTheme(value); }} data-theme-option={value}>
          <Icon /> {label}
        </Button>
      ))}
    </div>
  );
}

function Specimen({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2" data-specimen={name}>
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{name}</p>
      <div className="min-w-0 rounded-lg border border-dashed bg-background p-3 sm:p-5">{children}</div>
    </div>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4 border-t pt-8">
      <h2 className="text-xl font-medium tracking-[-0.01em]">{title}</h2>
      <div className="grid min-w-0 gap-6">{children}</div>
    </section>
  );
}

/**
 * Every ui component with normal and extreme fixtures, whole-spec edge cases,
 * and every format viewer. Development only: the route returns 404 elsewhere.
 */
export function ComponentGallery() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <h1 className="text-base font-medium">Component gallery</h1>
        <span className="text-xs text-muted-foreground">{uiComponentNames.length} components · development only</span>
        <div className="ml-auto"><ThemeToggle /></div>
      </header>
      <nav aria-label="Components" className="flex flex-wrap gap-x-3 gap-y-1 py-6 text-[13px] text-muted-foreground">
        {uiComponentNames.map((name) => <a key={name} href={`#${name}`} className="hover:text-foreground">{name}</a>)}
        <a href="#specs" className="hover:text-foreground">Specs</a>
        <a href="#formats" className="hover:text-foreground">Formats</a>
      </nav>
      <div className="space-y-12">
        {uiComponentNames.map((name) => (
          <Group key={name} id={name} title={name}>
            {componentFixtures[name].map((fixture) => (
              <Specimen key={fixture.name} name={fixture.name}>
                <UiView content={JSON.stringify(fixtureSpec(name, fixture))} />
              </Specimen>
            ))}
          </Group>
        ))}
        <Group id="specs" title="Whole specs">
          {specFixtures.map((fixture) => (
            <Specimen key={fixture.name} name={fixture.name}>
              <UiView content={JSON.stringify(fixture.spec)} />
            </Specimen>
          ))}
        </Group>
        <Group id="formats" title="Format viewers">
          {formatFixtures.map((fixture) => (
            <Specimen key={fixture.name} name={`${fixture.kind} · ${fixture.name}`}>
              <ArtifactView kind={fixture.kind} content={fixture.content} language={fixture.language} title={fixture.name} />
            </Specimen>
          ))}
        </Group>
      </div>
    </div>
  );
}
