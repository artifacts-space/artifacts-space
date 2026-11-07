import { CodeSnippet } from "@/components/code/code-snippet";
import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { docsMetadata } from "@/lib/docs/metadata";
import { contrastPairs, modeLightness } from "@/lib/themes/contrast";
import { syntaxMinimum } from "@/lib/themes/derive";
import { fontIdsFor, themeFonts, type FontRole } from "@/lib/themes/fonts";
import { themePresets } from "@/lib/themes/presets";
import { CHART_MAX, CHART_MIN, radiusScale, themeModes } from "@/lib/themes/schema";

export const metadata = docsMetadata("themes");

const page = "themes" as const;

const colorRows: [string, string, string][] = [
  ["background", "--background", "The page behind the artifact (the backdrop)."],
  ["foreground", "--foreground, --card-foreground", "Body text and headings."],
  ["mutedForeground", "--muted-foreground", "Secondary text: captions, labels, table heads."],
  ["card", "--card, --popover", "Cards, panels, and frames that sit on the page."],
  ["cardEdge", "--card-edge, --code-border", "The hairline edge of a card. May be transparent, such as oklch(0.2 0 0 / 0.09)."],
  ["accent", "--primary", "Primary buttons and the strongest marks."],
  ["accentForeground", "--primary-foreground", "Text on the accent."],
  ["chart", "--series-1 … --series-8", `${String(CHART_MIN)} to ${String(CHART_MAX)} chart colors, in order. Shorter palettes repeat.`],
];

const roleNames: Record<FontRole, string> = { body: "Body", heading: "Headings", mono: "Code" };

function slots(id: string): string {
  return (["body", "heading", "mono"] as const).filter((role) => fontIdsFor(role).some((item) => item === id)).map((role) => roleNames[role]).join(", ");
}

function presetFonts(fonts: { body?: string | undefined; heading?: string | undefined; mono?: string | undefined } | undefined): string {
  const name = (id: string | undefined, fallback: string) => themeFonts.find((font) => font.id === (id ?? fallback))?.family ?? fallback;
  return `${name(fonts?.heading, "geist-sans")} / ${name(fonts?.body, "geist-sans")} / ${name(fonts?.mono, "geist-mono")}`;
}

const kb = (bytes: number) => (bytes === 0 ? "Always loaded" : `${(bytes / 1024).toFixed(1)} KB`);

const classic = themePresets.find((preset) => preset.id === "classic");
const exampleJson = JSON.stringify({ ...classic?.theme, mode: "auto" }, null, 2);

/** The theme reference: tokens, presets, fonts, and the rules a theme must pass. */
export default function ThemesPage() {
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="overview" />
      <Prose>
        <p>A theme is a small set of design tokens for one artifact: colors for light and dark, a chart palette, a corner radius, and three fonts. It changes the artifact and the page behind it. The site header, comments, and controls keep the standard look.</p>
        <p>An artifact uses its own theme first, then its team&apos;s default theme, then the site default. A theme is either a preset id, such as <code>&quot;paper&quot;</code>, or theme JSON as described below. A theme that does not pass validation is never saved.</p>
        <p>Theme values never become raw CSS. Each value is parsed, checked, and written back in one canonical form, then set as a CSS custom property on the artifact&apos;s wrapper. Every card, chart, code block, diagram, and table inside picks the theme up from those properties.</p>
      </Prose>

      <DocsH page={page} id="tokens" />
      <Prose>
        <p>Theme JSON has <code>version</code> (always <code>1</code>), a <code>light</code> and a <code>dark</code> palette, and optional <code>radius</code>, <code>fonts</code>, and <code>mode</code>. Unknown keys are refused.</p>
      </Prose>

      <DocsH page={page} id="colors" />
      <Prose>
        <p>Each palette has these keys. Colors may be hex (<code>#1d4ed8</code>), <code>rgb()</code>, <code>hsl()</code>, or <code>oklch()</code>, and are stored as <code>oklch()</code>. Quieter surfaces (muted fills, borders, the code background, diagram lines) are mixed from these colors, and code syntax colors keep their hues but are adjusted until they read clearly on the code background.</p>
      </Prose>
      <FactTable head={["Key", "Sets", "Used for"]} rows={colorRows} mono={[0, 1]} />

      <DocsH page={page} id="radius" />
      <FactTable
        head={["radius", "--radius", "Cards"]}
        rows={Object.entries(radiusScale).map(([step, value]) => [step, value, step === "md" ? `${value} × 1.4 (the default)` : `${value} × 1.4`])}
        mono={[0, 1]}
      />

      <DocsH page={page} id="fonts" />
      <Prose>
        <p>A theme picks a <code>body</code>, a <code>heading</code>, and a <code>mono</code> font by id. Display faces are for headings only, and mono faces are for code only. Every face is served from artifacts.space, and a page loads a face only when its theme uses it. The size is the upright latin file a reader downloads.</p>
      </Prose>
      <FactTable head={["Id", "Font", "Slots", "Size"]} rows={themeFonts.map((font) => [font.id, font.family, slots(font.id), kb(font.bytes)])} mono={[0]} />

      <DocsH page={page} id="mode" />
      <Prose>
        <p>Readers keep their own light or dark choice, so every theme has both palettes. Set <code>mode</code> to lock one: {themeModes.map((mode, index) => <span key={mode}>{index > 0 ? ", " : ""}<code>&quot;{mode}&quot;</code></span>)}. The default is <code>&quot;auto&quot;</code>, which follows the reader.</p>
      </Prose>

      <DocsH page={page} id="presets" />
      <FactTable head={["Id", "Name", "Headings / body / code", "Look"]} rows={themePresets.map((preset) => [preset.id, preset.name, presetFonts(preset.theme.fonts), preset.description])} mono={[0]} />

      <DocsH page={page} id="validation" />
      <Prose>
        <ul>
          <li>Known keys only, at every level. <code>version</code> must be <code>1</code>.</li>
          <li>Colors must be hex, <code>rgb()</code>, <code>hsl()</code>, or <code>oklch()</code>, with channels in range. Named colors, <code>url()</code>, <code>var()</code>, <code>expression()</code>, comments, braces, and <code>;</code> are refused.</li>
          <li>Only <code>cardEdge</code> may be transparent. Every other color must be opaque, so contrast can be measured.</li>
          <li>The light palette&apos;s background and card need an oklch lightness of at least {modeLightness.light.min}; the dark palette&apos;s, at most {modeLightness.dark.max}.</li>
          <li>Fonts must come from the list above and suit their slot.</li>
          <li>Each problem comes back with the path of the value at fault, such as <code>dark.mutedForeground</code> or <code>fonts.body</code>.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="contrast" />
      <Prose>
        <p>Every theme must pass WCAG AA contrast in both palettes. A theme that fails is refused, never adjusted silently, and the message names the pair and its ratio, for example: <code>dark.mutedForeground on dark.card is 3.84:1; secondary text on cards needs at least 4.5:1 (WCAG AA).</code></p>
      </Prose>
      <FactTable head={["Text", "On", "Minimum", "Why"]} rows={contrastPairs.map((pair) => [pair.text, pair.surface, `${String(pair.minimum)}:1`, pair.use])} mono={[0, 1, 2]} />
      <Note title="Code colors">
        Syntax colors are derived, not set. Each reaches {String(syntaxMinimum.keyword)}:1 on the theme&apos;s code background ({String(syntaxMinimum.comment)}:1 for comments and punctuation).
      </Note>

      <DocsH page={page} id="example" />
      <Prose>
        <p>The Classic preset as theme JSON. Leave out <code>radius</code>, <code>fonts</code>, or <code>mode</code> to use the defaults: <code>&quot;md&quot;</code>, Geist and Geist Mono, and <code>&quot;auto&quot;</code>.</p>
      </Prose>
      <CodeSnippet title="theme.json" language="json" code={exampleJson} className="mt-4" />
    </RegistryPage>
  );
}
