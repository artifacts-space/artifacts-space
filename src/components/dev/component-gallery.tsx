"use client";

import { createContext, use, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ArtifactFilesProvider } from "@/components/artifact-view/files-context";
import { ThemeBackdrop, ThemeScope } from "@/components/artifact-view/theme-scope";
import { SheetFormatProvider } from "@/components/artifact-view/sheet-format";
import { plainSheetFormat } from "@/lib/sheet-format/rules";
import { SheetKeyContext } from "@/components/artifact-view/use-sheet-prefs";
import { AvatarGallery } from "@/components/dev/avatar-gallery";
import { ArtifactHeaderSpecimen } from "@/components/dev/artifact-header-specimen";
import { CoverSpecimen } from "@/components/dev/cover-specimen";
import { parseGalleryFilter, showsGroup, showsSpecimen, type GalleryFilter } from "@/components/dev/gallery-filter";
import { HarnessSpecimen } from "@/components/dev/harness-specimen";
import { imageStandIn, mediaFixtureFiles, mediaStandInUrl } from "@/components/dev/media-stand-ins";
import { NotificationsSpecimen } from "@/components/dev/notifications-specimen";
import { SwitchSpecimen } from "@/components/dev/switch-specimen";
import { ThemeFocusSpecimen } from "@/components/dev/theme-focus-specimen";
import { GroupedThemePickerSpecimen, ThemePickerSpecimen } from "@/components/dev/theme-picker-specimen";
import { ViewsSpecimen } from "@/components/dev/views-specimen";
import { UiView } from "@/components/artifact-view/ui-view";
import { ClientLogo } from "@/components/setup/client-logos";
import { DesktopAppInstalls } from "@/components/setup/desktop-app-installs";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { uiComponentNames } from "@/lib/ui/catalog";
import { componentFixtures, fixtureFiles, fixtureSpec } from "@/lib/ui/fixtures/components";
import { exampleUiSpec } from "@/lib/ui/fixtures/example";
import { brandMarksSpec } from "@/lib/ui/fixtures/brand-marks";
import { pressedToggleSpec, signInSpec } from "@/lib/ui/fixtures/fields";
import { formatFixtures, mediaFormatFixtures, type FormatFixture } from "@/lib/ui/fixtures/formats";
import { announcedSpec, landingPageSpec, styledBlocksSpec, surfaceMatrixSpecs } from "@/lib/ui/fixtures/screen";
import { deepSpec, invalidPropsSpec, javascriptLinkSpec, manyElementsSpec, repeatSpec, unknownTypeSpec } from "@/lib/ui/fixtures/specs";
import { desktopApps, mcpClients } from "@/lib/setup/client-installs";
import { presetTheme } from "@/lib/themes/resolve";

/** Whole specs, each drawn as its own interface; a specimen of several draws them one under another. */
const specFixtures: { name: string; specs: readonly unknown[] }[] = [
  { name: "Example", specs: [exampleUiSpec] },
  { name: "Surfaces and tones", specs: surfaceMatrixSpecs },
  { name: "Landing page", specs: [landingPageSpec] },
  { name: "Brand marks", specs: [brandMarksSpec] },
  { name: "Sign-in screen", specs: [signInSpec] },
  { name: "Styled blocks", specs: [styledBlocksSpec] },
  { name: "Announced line and a toggle", specs: [announcedSpec] },
  { name: "Pressed toggle", specs: [pressedToggleSpec] },
  { name: "Unknown type", specs: [unknownTypeSpec] },
  { name: "Invalid props", specs: [invalidPropsSpec] },
  { name: "javascript: link", specs: [javascriptLinkSpec] },
  { name: "Repeat, 200 items", specs: [repeatSpec(200)] },
  { name: "Too many elements (501)", specs: [manyElementsSpec(500)] },
  { name: "Too deep (21)", specs: [deepSpec(21)] },
];

/** Gallery files are not uploaded: outside the media group, every one (image or PDF) shows the SVG stand-in (media-stand-ins.ts). */
const standInUrl = () => imageStandIn;

/** One format viewer specimen, with the gallery's stand-in files (or the media group's, which add a video and a recording). */
function FormatSpecimen({ fixture, media = false }: { fixture: FormatFixture; media?: boolean }) {
  return (
    <Specimen name={`${fixture.kind} · ${fixture.name}`}>
      <ArtifactFilesProvider files={media ? mediaFixtureFiles : fixtureFiles} urlFor={media ? mediaStandInUrl : standInUrl}>
        {/* Sheets keep each viewer's column widths and order per artifact; here, per specimen. */}
        <SheetKeyContext value={`gallery-${fixture.name}`}>
          <SheetFormatProvider stored={fixture.sheetFormat ?? plainSheetFormat} save={null}>
            <ArtifactView kind={fixture.kind} content={fixture.content} language={fixture.language} title={fixture.name} />
          </SheetFormatProvider>
        </SheetKeyContext>
      </ArtifactFilesProvider>
    </Specimen>
  );
}

/** What the page draws (`?show=`), and the id of the group a specimen sits in. */
const FilterContext = createContext<GalleryFilter>(null);
const GroupContext = createContext("");

function Specimen({ name, children }: { name: string; children: ReactNode }) {
  const filter = use(FilterContext);
  if (!showsSpecimen(filter, use(GroupContext), name)) return null;
  return (
    <div className="min-w-0 space-y-2" data-specimen={name}>
      <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{name}</p>
      <div className="min-w-0 rounded-lg border border-dashed bg-background p-3 sm:p-5">{children}</div>
    </div>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  if (!showsGroup(use(FilterContext), id)) return null;
  return (
    <section id={id} className="scroll-mt-20 space-y-4 border-t pt-8">
      <h2 className="text-xl font-medium tracking-[-0.01em]">{title}</h2>
      <GroupContext value={id}>
        <div className="grid min-w-0 gap-6">{children}</div>
      </GroupContext>
    </section>
  );
}

/** Specs drawn one under another, each as its own interface. */
function SpecStack({ specs }: { specs: readonly unknown[] }) {
  return (
    <div className="space-y-4">
      {specs.map((spec, index) => <UiView key={index} content={JSON.stringify(spec)} />)}
    </div>
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
          {/* Every Box surface under the theme: inverse, primary, and the hues re-light what sits on them. */}
          <div data-themed-surfaces={id}><SpecStack specs={surfaceMatrixSpecs} /></div>
        </ThemeScope>
      </ThemeBackdrop>
    </Specimen>
  );
}

const neverChanges = () => () => undefined;

/**
 * Says the gallery has hydrated, for tests. The server leaves the mark out
 * and the browser adds it once React has taken over every group above it.
 * The server's HTML is on screen before that, and a test that writes on it
 * (an accessibility scan marks what it scans) would differ from what React
 * expects to find.
 */
function ReadyMark() {
  const hydrated = useSyncExternalStore(neverChanges, () => true, () => false);
  return hydrated ? <span hidden data-gallery-ready="" /> : null;
}

/**
 * Every ui component with normal and extreme fixtures, whole-spec edge cases,
 * and every format viewer. Development only: the route returns 404 elsewhere.
 * `show` (the page's `?show=` values) limits it to some groups or specimens,
 * so a test draws only what it reads (gallery-filter.ts); without it, all of it.
 */
export function ComponentGallery({ show }: { show?: string | readonly string[] }) {
  const filter = useMemo(() => parseGalleryFilter(show), [show]);
  return (
    <FilterContext value={filter}>
      <GalleryPage />
    </FilterContext>
  );
}

function GalleryPage() {
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
        <a href="#switches" className="hover:text-foreground">Switches</a>
        <a href="#notifications" className="hover:text-foreground">Notifications</a>
        <a href="#clients" className="hover:text-foreground">Clients</a>
        <a href="#harnesses" className="hover:text-foreground">Agents</a>
        <a href="#media" className="hover:text-foreground">Media</a>
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
              <SpecStack specs={fixture.specs} />
            </Specimen>
          ))}
        </Group>
        <Group id="formats" title="Format viewers">
          {formatFixtures.map((fixture) => <FormatSpecimen key={fixture.name} fixture={fixture} />)}
        </Group>
        <Group id="themes" title="Themes">
          {themeFixtureIds.map((id) => <ThemedSpecimen key={id} id={id} />)}
          <Specimen name="theme · focus ring">
            <ThemeFocusSpecimen />
          </Specimen>
          <Specimen name="theme picker">
            <ThemePickerSpecimen />
          </Specimen>
          <Specimen name="theme picker · groups">
            <GroupedThemePickerSpecimen />
          </Specimen>
          <Specimen name="cover picker">
            <CoverSpecimen />
          </Specimen>
          <Specimen name="artifact page chrome">
            <ArtifactHeaderSpecimen />
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
        <Group id="switches" title="Switches">
          <Specimen name="switch states">
            <SwitchSpecimen />
          </Specimen>
        </Group>
        <Group id="notifications" title="Notification settings">
          <NotificationsSpecimen />
        </Group>
        <Group id="clients" title="MCP client marks">
          <Specimen name="every client, in setup order">
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              {mcpClients.map((client) => (
                <li key={client.id} data-client={client.id} className="flex items-center gap-2">
                  <ClientLogo id={client.id} />
                  <span data-client-label="">{client.label}</span>
                </li>
              ))}
            </ul>
          </Specimen>
          <Specimen name="add to a desktop app">
            <DesktopAppInstalls origin="https://artifacts.space" apps={desktopApps} />
          </Specimen>
        </Group>
        <Group id="harnesses" title="Agent harnesses">
          <HarnessSpecimen />
        </Group>
        {/* Last: media blocks change height as they load, which would move any group under them. */}
        <Group id="media" title="Media blocks">
          {mediaFormatFixtures.map((fixture) => <FormatSpecimen key={fixture.name} fixture={fixture} media />)}
        </Group>
      </div>
      <ReadyMark />
    </div>
  );
}
