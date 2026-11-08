"use client";

import type { ReactNode } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ArtifactFilesProvider } from "@/components/artifact-view/files-context";
import { ThemeBackdrop, ThemeScope } from "@/components/artifact-view/theme-scope";
import { AvatarGallery } from "@/components/dev/avatar-gallery";
import { CoverSpecimen } from "@/components/dev/cover-specimen";
import { NotificationsSpecimen } from "@/components/dev/notifications-specimen";
import { ThemePickerSpecimen } from "@/components/dev/theme-picker-specimen";
import { ViewsSpecimen } from "@/components/dev/views-specimen";
import { UiView } from "@/components/artifact-view/ui-view";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { uiComponentNames } from "@/lib/ui/catalog";
import { componentFixtures, fixtureFiles, fixtureSpec } from "@/lib/ui/fixtures/components";
import { exampleUiSpec } from "@/lib/ui/fixtures/example";
import { formatFixtures } from "@/lib/ui/fixtures/formats";
import { deepSpec, invalidPropsSpec, javascriptLinkSpec, manyElementsSpec, repeatSpec, unknownTypeSpec } from "@/lib/ui/fixtures/specs";
import { presetTheme } from "@/lib/themes/resolve";

const specFixtures: { name: string; spec: unknown }[] = [
  { name: "Example", spec: exampleUiSpec },
  { name: "Unknown type", spec: unknownTypeSpec },
  { name: "Invalid props", spec: invalidPropsSpec },
  { name: "javascript: link", spec: javascriptLinkSpec },
  { name: "Repeat, 200 items", spec: repeatSpec(200) },
  { name: "Too many elements (501)", spec: manyElementsSpec(500) },
  { name: "Too deep (21)", spec: deepSpec(21) },
];

/** Gallery files are not uploaded: every one shows a local stand-in image instead. */
/**
 * Every fixture file (image, PDF, video) shows this stand-in. It is an inline
 * data URL, not a file on this site: the site sends frame-ancestors 'none'
 * (src/lib/security-header-rules.ts), so a PDF iframe pointed at a site path
 * would be blocked, while the real viewer frames /api/files, which allows it.
 */
const standInUrl = () => "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill-opacity='.08'/%3E%3C/svg%3E";

function Specimen({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2" data-specimen={name}>
      <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{name}</p>
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

/** Presets shown in a scope that follows the site's light or dark mode, as an artifact page will. */
const themeFixtureIds = ["ocean", "editorial"] as const;
const themedFormats = new Set(["Markdown", "Code", "Mermaid", "CSV"]);

function ThemedSpecimen({ id }: { id: string }) {
  const theme = presetTheme(id) ?? null;
  return (
    <Specimen name={`theme · ${id}`}>
      <ThemeBackdrop theme={theme} className="rounded-md p-3 sm:p-5" data-theme-backdrop={id}>
        <ThemeScope theme={theme} className="space-y-6 text-foreground" data-theme-scope={id}>
          {formatFixtures.filter((fixture) => themedFormats.has(fixture.name)).map((fixture) => (
            <ArtifactView key={fixture.name} kind={fixture.kind} content={fixture.content} language={fixture.language} title={fixture.name} />
          ))}
        </ThemeScope>
      </ThemeBackdrop>
    </Specimen>
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
        <div className="ml-auto"><ThemeSwitcher /></div>
      </header>
      <nav aria-label="Components" className="flex flex-wrap gap-x-3 gap-y-1 py-6 text-sm text-muted-foreground">
        {uiComponentNames.map((name) => <a key={name} href={`#${name}`} className="hover:text-foreground">{name}</a>)}
        <a href="#specs" className="hover:text-foreground">Specs</a>
        <a href="#formats" className="hover:text-foreground">Formats</a>
        <a href="#themes" className="hover:text-foreground">Themes</a>
        <a href="#avatars" className="hover:text-foreground">Avatars</a>
        <a href="#views" className="hover:text-foreground">Views</a>
        <a href="#notifications" className="hover:text-foreground">Notifications</a>
      </nav>
      <div className="space-y-12">
        {uiComponentNames.map((name) => (
          <Group key={name} id={name} title={name}>
            {componentFixtures[name].map((fixture) => (
              <Specimen key={fixture.name} name={fixture.name}>
                <ArtifactFilesProvider files={fixtureFiles} urlFor={standInUrl}>
                  <UiView content={JSON.stringify(fixtureSpec(name, fixture))} />
                </ArtifactFilesProvider>
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
              <ArtifactFilesProvider files={fixtureFiles} urlFor={standInUrl}>
                <ArtifactView kind={fixture.kind} content={fixture.content} language={fixture.language} title={fixture.name} />
              </ArtifactFilesProvider>
            </Specimen>
          ))}
        </Group>
        <Group id="themes" title="Themes">
          {themeFixtureIds.map((id) => <ThemedSpecimen key={id} id={id} />)}
          <Specimen name="theme picker">
            <ThemePickerSpecimen />
          </Specimen>
          <Specimen name="cover picker">
            <CoverSpecimen />
          </Specimen>
        </Group>
        <Group id="avatars" title="Pixel avatars">
          <AvatarGallery />
        </Group>
        <Group id="views" title="Views">
          <Specimen name="views dialog">
            <ViewsSpecimen />
          </Specimen>
        </Group>
        <Group id="notifications" title="Notification settings">
          <NotificationsSpecimen />
        </Group>
      </div>
    </div>
  );
}
