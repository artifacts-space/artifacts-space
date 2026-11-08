import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { CoverGradientGallery } from "@/components/docs/cover-gradient-gallery";
import { ThemePresetGallery } from "@/components/docs/theme-preset-gallery";
import { coverImageRows, coverMcpExamples } from "@/lib/docs/cover-docs";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { classicThemeJson, lowContrastMessage, themeFieldRows, themeLimitRows, themeMcpExamples, themesListExample } from "@/lib/docs/theme-docs";
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
  ["card", "--card, --popover", "Cards, panels, and frames on the page."],
  ["cardEdge", "--card-edge, --code-border", "The hairline edge of a card. It can be transparent, such as oklch(0.2 0 0 / 0.09)."],
  ["accent", "--primary", "Primary buttons and the strongest marks."],
  ["accentForeground", "--primary-foreground", "Text on the accent."],
  ["chart", "--series-1 … --series-8", `${String(CHART_MIN)} to ${String(CHART_MAX)} chart colors, in order. A shorter palette repeats.`],
];

const roleNames: Record<FontRole, string> = { body: "Body", heading: "Headings", mono: "Code" };

function slots(id: string): string {
  return (["body", "heading", "mono"] as const).filter((role) => fontIdsFor(role).some((item) => item === id)).map((role) => roleNames[role]).join(", ");
}

const kb = (bytes: number) => (bytes === 0 ? "Always loaded" : `${(bytes / 1024).toFixed(1)} KB`);

/** The theme guide and reference: presets, the picker, MCP, theme JSON, and the rules every theme passes. */
export default function ThemesPage() {
  return (
    <RegistryPage slug={page}>
      <DocsH page={page} id="overview" />
      <Prose>
        <p>A theme gives one artifact its own look. A long report can read like a printed page, and a dashboard can match your brand. Every theme passes WCAG AA contrast in light and dark, so every reader can read it.</p>
        <p>A theme changes these parts:</p>
        <ul>
          <li>The colors of the content: text, cards, buttons, charts, code, diagrams, and tables.</li>
          <li>The page behind the artifact (the backdrop).</li>
          <li>The corner radius and the fonts.</li>
        </ul>
        <p>The site header, the comments, and the controls keep the standard look, so readers always know where they are. The theme applies for every reader of the artifact.</p>
        <p>A theme is a preset id, such as <code>&quot;paper&quot;</code>, a team preset id, or theme JSON. An artifact with no theme of its own uses its team&apos;s default, or else the Default look. See <a href="#team">Team themes</a>. Every format can have a theme.</p>
        <p>Theme values never become raw CSS. The server checks each value and writes it again in one standard form. The page sets each value as a CSS custom property on the artifact&apos;s wrapper, and every card, chart, code block, diagram, and table inside reads it.</p>
      </Prose>

      <DocsH page={page} id="presets" />
      <Prose>
        <p>There are {themePresets.length} presets. Each sample below uses the same theme engine as the artifact page, so you see what readers get. Copy an id and pass it as <code>theme</code>.</p>
      </Prose>
      <ThemePresetGallery />

      <DocsH page={page} id="artifact" />
      <Prose>
        <p>People set a theme in the web app. Agents set it over MCP. Both save the theme the same way, as part of the artifact&apos;s history.</p>
      </Prose>

      <DocsH page={page} id="web" />
      <Prose>
        <p>If you can edit an artifact, you see <strong>Theme</strong> beside the icon above its title. On a computer, it shows when you point at the title. On a touch screen, it always shows. When the artifact has a theme, the button shows the theme&apos;s name.</p>
        <p>Select it to open the presets as live samples, each with its name and fonts. Select a preset to apply it at once. Select Default to go back to the standard look. The arrow keys, Home, and End move between samples, and Enter or Space selects one.</p>
        <p>When the artifact is shared with a team, the picker also shows that team&apos;s presets, under the team&apos;s name. When the team has a default, the first sample is <strong>Team default</strong>: it is selected while the artifact has no theme of its own, and selecting it removes the artifact&apos;s own theme. A private artifact offers the presets of every team you belong to.</p>
        <p>The picker shows presets only. Agents can also set theme JSON over MCP. Then the picker tells you that the artifact has a custom theme, and a preset you select replaces it.</p>
        <p>Readers do not see the control. They see only the theme.</p>
      </Prose>

      <DocsH page={page} id="new" />
      <Prose>
        <p>The <strong>New artifact</strong> dialog has a <strong>Theme</strong> field with the same picker, including the presets of your teams. The artifact starts with the preset you select. Keep Default for the standard look.</p>
      </Prose>

      <DocsH page={page} id="mcp" />
      <Prose>
        <p>Agents set <code>theme</code> on <code>artifacts_create</code> or <code>artifacts_update</code>, on artifacts they can edit. The value is one of these:</p>
        <ul>
          <li>A preset id, such as <code>&quot;paper&quot;</code>.</li>
          <li>A team preset id, such as <code>&quot;team:acme-brand-x7k2p9&quot;</code>. See <a href="#team-mcp">Team themes over MCP</a>.</li>
          <li>Theme JSON, as described in <a href="#tokens">Theme JSON</a>.</li>
          <li><code>null</code> or <code>&quot;&quot;</code> on update, to remove the theme. The page goes back to the team default, or else the Default look.</li>
        </ul>
        <p>Leave out <code>theme</code> to keep the current theme. <code>artifacts_get</code> and <code>artifacts_list</code> return the stored value: a preset id, theme JSON in its standard form, or <code>null</code>. <code>artifacts_versions</code> shows the theme of each version.</p>
      </Prose>
      <CodeSnippet title="Create with a preset" language="json" code={themeMcpExamples.createWithPreset} className="mt-4" />
      <CodeSnippet title="Update with theme JSON" language="json" code={themeMcpExamples.updateWithJson} className="mt-4" />
      <CodeSnippet title="Remove the theme" language="json" code={themeMcpExamples.clear} className="mt-4" />
      <Prose>
        <p>A theme that fails validation stops the whole call: nothing is saved. The error lists every problem, and for low contrast it gives colors that pass. See <a href="#suggestions">Suggested colors</a>. Agents cannot make or change presets.</p>
      </Prose>

      <DocsH page={page} id="themes-list" />
      <Prose>
        <p><code>themes_list</code> returns each preset with its id, name, look, mode, and fonts, then, under <code>teams</code>, the presets and default of each team you belong to. It also returns the font ids that theme JSON can use in each slot. It saves nothing, and read-only connections can use it. See the <Link href={docsHref("mcp", "themes_list")}>MCP reference</Link>.</p>
      </Prose>
      <CodeSnippet title="themes_list result, abridged" language="json" code={themesListExample()} className="mt-4" />

      <DocsH page={page} id="history" />
      <Prose>
        <p>A theme change is saved as a new version, like a title or icon change. History shows it, and Restore brings an older theme back.</p>
        <p>On a link or public artifact shared through a team, a theme change by a member or an agent waits for a team owner or admin to approve it, like a title change. Until then, readers outside the team see the approved theme. Owners and admins see the old and new theme names on the team page. Agents never approve. See <Link href={docsHref("sharing", "edits")}>Edits to shared artifacts</Link>.</p>
      </Prose>

      <DocsH page={page} id="team" />
      <Prose>
        <p>A team can give its artifacts one look. Team owners and admins keep the team&apos;s own presets and pick a team default on the team page, under <strong>Themes</strong>. Everyone in the team can see them and use the presets. People outside the team never see the list; they see only how an artifact looks.</p>
      </Prose>
      <DocsH page={page} id="resolution" />
      <Prose>
        <p>The first match wins:</p>
        <ol>
          <li>The artifact&apos;s own theme: a preset, a team preset, or theme JSON.</li>
          <li>The default of the team the artifact is shared through (team, link, or public in a shared team).</li>
          <li>The Default look.</li>
        </ol>
        <p>Private artifacts, and artifacts shared through a personal team, have no team default. Every reader sees the same theme, signed in or not: a public page in a team with a default shows that default to everyone.</p>
      </Prose>
      <DocsH page={page} id="team-presets" />
      <Prose>
        <p>Owners and admins create, edit, duplicate, and delete presets. The editor has a form for every theme field (colors for light and dark, chart colors, fonts from the allowlist, radius, and mode) and a JSON tab with the same theme JSON agents use. A live preview draws a sample artifact and cover with the real theme, in light or dark. Start a new preset from any built-in or team preset.</p>
        <p>A preset must pass the same <a href="#validation">validation</a> and <a href="#contrast">contrast</a> checks as any theme. Text that fails contrast is marked at its field with a suggested color that passes, and <strong>Apply suggestions</strong> sets them all.</p>
        <p>A team preset id looks like <code>team:acme-brand-x7k2p9</code> and never changes, even when the preset is renamed. Artifacts store this id, not a copy, so an edit to the preset shows on every artifact that uses it at once, with no new versions and no approval. Versions store the id too.</p>
        <p>Before you delete a preset, the team page says how many artifacts use it. They fall back to the team default, then the Default look. If it was the team default, the team goes back to the Default look. An artifact that moves to another team, or that names another team&apos;s preset, falls back the same way.</p>
        <p>A team can keep up to 50 presets.</p>
      </Prose>
      <DocsH page={page} id="team-default" />
      <Prose>
        <p>Owners and admins pick a built-in preset or a team preset as the team default, or <strong>Site default</strong> for none. It is a team setting: it files no artifact versions and needs no approval. The team page shows who changed it last and when, and the server logs each change.</p>
      </Prose>
      <DocsH page={page} id="team-mcp" />
      <Prose>
        <p><code>themes_list</code> returns the presets and default of each team you belong to, never another team&apos;s. Pass a team preset id as <code>theme</code> on an artifact shared through that team, or on a private artifact when you belong to the team. Any other team preset id is refused, and nothing is saved.</p>
        <p>Agents use team presets but never create, change, or delete them, and never change the team default. Those stay with the team&apos;s owners and admins.</p>
      </Prose>

      <DocsH page={page} id="covers" />
      <Prose>
        <p>A cover is a slim banner across the top of the artifact page, like a book jacket: it makes an artifact easy to know at a glance. It is about 180 px tall on a computer and 120 px on a phone, so the content still starts near the top.</p>
        <p>A cover is a gradient id, such as <code>&quot;mist&quot;</code>, or an image you upload. Every format can have a cover. An artifact with no cover shows none.</p>
      </Prose>

      <DocsH page={page} id="cover-gradients" />
      <Prose>
        <p>Gradients are soft tints of the artifact&apos;s own theme colors, so a cover always matches the theme, in light and in dark. Each sample shows light and dark in the Default look (top row) and in Ocean (bottom row). Copy an id and pass it as <code>cover</code>.</p>
      </Prose>
      <CoverGradientGallery />

      <DocsH page={page} id="cover-web" />
      <Prose>
        <p>If you can edit an artifact, you see <strong>Add cover</strong> beside the icon and theme above its title. It adds a gradient at once. Point at the cover (or tap it on a touch screen) to see its controls:</p>
        <ul>
          <li><strong>Change cover</strong> opens the gradients and <strong>Upload an image</strong>. Any photo works, straight from your phone: your browser turns it upright, resizes it to at most 2400 px, saves it as a JPEG under 2 MB, and removes its camera data, such as the location. A PNG with transparency stays a PNG when it already fits. Browsers that cannot open HEIC photos say so; save the photo as a JPEG first.</li>
          <li><strong>Reposition</strong>, for images, lets you drag the image up or down. You can also use the arrow keys (Shift for bigger steps), Home, and End. Enter or <strong>Save position</strong> saves; Escape or <strong>Cancel</strong> stops.</li>
          <li><strong>Remove</strong> takes the cover away at once. Restore brings it back (see History and approval).</li>
        </ul>
        <p>The <strong>New artifact</strong> dialog has a <strong>Cover</strong> field with the gradients. Readers see only the cover.</p>
      </Prose>

      <DocsH page={page} id="cover-mcp" />
      <Prose>
        <p>Agents set <code>cover</code> on <code>artifacts_create</code> or <code>artifacts_update</code>, on artifacts they can edit. The value is a gradient id, <code>&quot;file:&lt;file id&gt;&quot;</code> for an uploaded image, or <code>null</code> or <code>&quot;&quot;</code> on update to remove it. <code>coverPosition</code> (0 to 100) sets an image&apos;s focal point; sent alone, it moves the current image cover. Leave both out to keep the cover.</p>
        <p><code>themes_list</code> lists the gradients. <code>artifacts_get</code>, <code>artifacts_list</code>, and <code>artifacts_versions</code> return <code>cover</code> and <code>coverPosition</code>. A cover that breaks a rule stops the whole call, and nothing is saved.</p>
      </Prose>
      <CodeSnippet title="Create with a theme and a gradient cover" language="json" code={coverMcpExamples.createWithGradient} className="mt-4" />
      <CodeSnippet title="Use an uploaded image, focused near the top" language="json" code={coverMcpExamples.updateWithImage} className="mt-4" />
      <CodeSnippet title="Move the image's focal point" language="json" code={coverMcpExamples.reposition} className="mt-4" />
      <CodeSnippet title="Remove the cover" language="json" code={coverMcpExamples.clear} className="mt-4" />

      <DocsH page={page} id="cover-images" />
      <Prose>
        <p>Upload the image like any file (<code>files_request_upload</code>, then PUT, then <code>files_finalize</code>), and pass its id. The save attaches it to the artifact. Only people who can read the artifact can load the image.</p>
      </Prose>
      <FactTable head={["Rule", "Value"]} rows={coverImageRows} mono={[0]} />

      <DocsH page={page} id="cover-history" />
      <Prose>
        <p>A cover change, including a new focal point, is saved as a new version. History shows it, and Restore brings an older cover back, image included: an uploaded cover image is kept while any version in the history shows it, and deleted when the last such version leaves the history (after 100 newer versions or a year) or when the artifact is deleted. If you deleted the image file yourself, Restore leaves the artifact without a cover. Readers outside the team can open only the approved version&apos;s cover image.</p>
        <p>On a link or public artifact shared through a team, a cover change by a member or an agent waits for a team owner or admin to approve it. Until then, readers outside the team see the approved cover. Agents never approve.</p>
      </Prose>

      <DocsH page={page} id="outside" />
      <Prose>
        <p>The theme also shows where the artifact appears away from its page.</p>
      </Prose>
      <DocsH page={page} id="markdown" />
      <Prose>
        <p>The Markdown version of an artifact (<code>/artifact/&lt;id&gt;.md</code>) names the theme it shows in the header, as <code>- Theme: Paper</code>, <code>- Theme: Custom</code> for theme JSON, or <code>- Theme: Acme brand (team default)</code> when it shows its team&apos;s default. An artifact that shows the Default look has no Theme line. A cover shows as <code>- Cover: Mist</code>, or <code>- Cover: Image</code>, never with a link to the file. See <Link href={docsHref("mcp", "markdown")}>Read artifacts without MCP</Link>.</p>
      </Prose>
      <DocsH page={page} id="previews" />
      <Prose>
        <p>The link preview card of a link or public artifact uses the light palette of the theme the approved version shows: its own, or else the team default. The text on the card stays in Geist, because preview images cannot use the theme fonts.</p>
        <p>A cover becomes the card&apos;s background. A gradient is drawn in the theme&apos;s light palette, with dark text. A PNG or JPEG image of at most 2 MB is drawn under a dark shade, with light text. Preview images cannot draw WebP, GIF, or AVIF, so those covers keep the standard background there. Images uploaded in the web app are always JPEG or PNG.</p>
      </Prose>

      <DocsH page={page} id="tokens" />
      <Prose>
        <p>Theme JSON is an object with these keys. Unknown keys are refused at every level.</p>
      </Prose>
      <FactTable head={["Key", "Value", "Rule"]} rows={themeFieldRows} mono={[0, 1]} />

      <DocsH page={page} id="colors" />
      <Prose>
        <p>Each palette has these keys. Colors can be hex (<code>#1d4ed8</code>), <code>rgb()</code>, <code>hsl()</code>, or <code>oklch()</code>, and are stored as <code>oklch()</code>. Quieter surfaces (muted fills, borders, the code background, and diagram lines) are mixed from these colors. Code syntax colors keep their hues but change in lightness until they are clear on the code background.</p>
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
        <p>A theme sets a <code>body</code>, a <code>heading</code>, and a <code>mono</code> font by id. Display faces are for headings only, and mono faces are for code only. The size is the upright latin file that a reader downloads.</p>
      </Prose>
      <FactTable head={["Id", "Font", "Slots", "Size"]} rows={themeFonts.map((font) => [font.id, font.family, slots(font.id), kb(font.bytes)])} mono={[0]} />

      <DocsH page={page} id="mode" />
      <Prose>
        <p>Readers keep their own light or dark choice, so every theme has both palettes. Set <code>mode</code> to lock one: {themeModes.map((mode, index) => <span key={mode}>{index > 0 ? ", " : ""}<code>&quot;{mode}&quot;</code></span>)}. The default is <code>&quot;auto&quot;</code>, which follows the reader.</p>
      </Prose>

      <DocsH page={page} id="limits" />
      <FactTable head={["Limit", "Value"]} rows={themeLimitRows} mono={[0]} />

      <DocsH page={page} id="validation" />
      <Prose>
        <ul>
          <li>Known keys only, at every level. <code>version</code> must be <code>1</code>.</li>
          <li>Colors must be hex, <code>rgb()</code>, <code>hsl()</code>, or <code>oklch()</code>, with channels in range. Named colors, <code>url()</code>, <code>var()</code>, <code>expression()</code>, comments, braces, and <code>;</code> are refused.</li>
          <li>Only <code>cardEdge</code> can be transparent. Every other color must be opaque, so its contrast can be measured.</li>
          <li>In the light palette, the background and the card need an oklch lightness of at least {modeLightness.light.min}. In the dark palette, they need at most {modeLightness.dark.max}.</li>
          <li>Fonts must come from the list above and suit their slot.</li>
          <li>Each problem comes back with the path of the bad value, such as <code>dark.mutedForeground</code> or <code>fonts.body</code>.</li>
        </ul>
      </Prose>

      <DocsH page={page} id="contrast" />
      <Prose>
        <p>Every theme must pass WCAG AA contrast in both palettes. A theme that fails is refused. It is never changed without notice. The message names the pair and its ratio.</p>
      </Prose>
      <FactTable head={["Text", "On", "Minimum", "Why"]} rows={contrastPairs.map((pair) => [pair.text, pair.surface, `${String(pair.minimum)}:1`, pair.use])} mono={[0, 1, 2]} />
      <Note title="Code colors">
        Syntax colors come from the theme. You do not set them. Each reaches {String(syntaxMinimum.keyword)}:1 on the theme&apos;s code background ({String(syntaxMinimum.comment)}:1 for comments and punctuation).
      </Note>

      <DocsH page={page} id="suggestions" />
      <Prose>
        <p>When contrast fails, the error also gives the nearest passing color for each failing text color. The fix moves only the lightness of the text colors and the accent, away from their surface. It never changes a background or a card. Use the suggested colors as given, and the theme passes.</p>
        <p>This is the real error for the Classic preset with secondary text that is too faint in both palettes:</p>
      </Prose>
      <CodeSnippet title="Error text" language="text" code={lowContrastMessage()} wrap className="mt-4" />

      <DocsH page={page} id="example" />
      <Prose>
        <p>The Classic preset as theme JSON. Leave out <code>radius</code>, <code>fonts</code>, or <code>mode</code> to use the defaults: <code>&quot;md&quot;</code>, Geist and Geist Mono, and <code>&quot;auto&quot;</code>.</p>
      </Prose>
      <CodeSnippet title="theme.json" language="json" code={classicThemeJson} className="mt-4" />

      <DocsH page={page} id="vendoring" />
      <Prose>
        <p>A page loads only the fonts of the theme it shows. A page with no theme loads only Geist, the site font. The picker loads each preset&apos;s fonts only while it is open, and the samples on this page load their fonts when you scroll to them.</p>
        <p>Every theme font except Geist comes from Google Fonts under the SIL Open Font License. The files are stored in the repository under <code>public/fonts/v1/&lt;id&gt;/</code>: the latin woff2 files, a small <code>font.css</code>, and the font&apos;s license. Readers&apos; browsers never get a font from another site.</p>
      </Prose>
    </RegistryPage>
  );
}
