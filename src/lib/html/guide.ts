import { artifactSizeLimits } from "@/lib/artifact-limits";
import { pageScriptHosts } from "@/lib/page-host/rules";

const hostNames = pageScriptHosts.map((host) => host.replace("https://", ""));

/**
 * The guide agents read before they write an HTML artifact
 * (artifacts_formats_guide with kind "html"). Every rule here is what the
 * sandbox enforces (src/lib/page-host/rules.ts): the hosts come from the
 * same list as the page's Content-Security-Policy.
 */
export function buildHtmlGuide(): string {
  return [
    "HTML (html): a full web page that runs in a sandbox. Use it for anything visual or interactive: mockups of websites and apps, prototypes, dashboards, reports, explainers, small tools.",
    "",
    "The document",
    "- One HTML document. It must start with <!doctype html>.",
    "- Put the CSS in <style> and the JavaScript in <script>, inside the document. There are no separate files.",
    `- At most ${artifactSizeLimits.maxContentBytes.toLocaleString("en-US")} bytes.`,
    '- Add <meta name="viewport" content="width=device-width, initial-scale=1">, a <title>, and lang on <html>.',
    "",
    "What the page may load",
    `- Scripts, styles, fonts, images, and data may load only from: ${hostNames.join(", ")}. Styles and fonts may also load from fonts.googleapis.com and fonts.gstatic.com.`,
    "- Pin a version, for example https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js. For utility classes, https://cdn.tailwindcss.com works.",
    '- ES modules work: <script type="module"> with imports from https://esm.sh/.',
    "- Every other request is refused: no fetch or XMLHttpRequest to your own API or any other site, no images or media from other sites, no analytics. Put the data in the page.",
    "- Embed your own images as inline SVG or as data: URIs.",
    "",
    "What the page cannot do",
    "- Submit a form to a server. Handle input with JavaScript in the page.",
    "- Show another page in an iframe, or navigate the tab it is shown in.",
    '- Open another site in its own place. Write links to other sites as <a href="…" target="_blank" rel="noopener">, so they open in a new tab.',
    "- Read anything of artifacts.space, of the reader, or of another artifact.",
    "",
    "What works",
    "- Inline scripts and styles, canvas, SVG, CSS animation, web workers from a blob: URL.",
    "- localStorage and sessionStorage. They belong to this artifact and to the reader's browser: another reader, or the same reader in another browser, starts empty. Wrap each use in try/catch.",
    "",
    "How it is shown",
    "- People see the running page in a frame on the artifact page: as wide as the page, about 80% of the window's height. The page scrolls inside the frame.",
    "- Make the layout work from 360 px wide to a desktop window.",
    "- The page sets its own colors. Without them it is black text on white. Check that text passes WCAG AA contrast.",
    "- Editors change the page through View source, or through you.",
    "",
    "Saving",
    '- artifacts_create with kind "html" and the document as content. To change it, send the whole new document with artifacts_update and the baseVersion you read.',
    '- artifacts_validate with kind "html" checks that the document starts as a page. It does not run it: read your scripts for errors before you save.',
    "",
    "Example",
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    "  <title>Signups this week</title>",
    "  <style>",
    "    body { margin: 0; padding: 2rem; font: 16px/1.5 system-ui, sans-serif; color: #1a1a1a; background: #fafaf9; }",
    "    .bars { display: flex; align-items: end; gap: 0.5rem; height: 12rem; }",
    "    .bars div { flex: 1; background: #2563eb; border-radius: 4px 4px 0 0; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <h1>Signups this week</h1>",
    '  <div class="bars" id="bars" role="img" aria-label="Signups per day, Monday to Friday"></div>',
    "  <script>",
    "    const perDay = [12, 18, 9, 24, 30];",
    "    const top = Math.max(...perDay);",
    '    document.getElementById("bars").append(...perDay.map((count) => {',
    '      const bar = document.createElement("div");',
    '      bar.style.height = (count / top) * 100 + "%";',
    "      bar.title = String(count);",
    "      return bar;",
    "    }));",
    "  </script>",
    "</body>",
    "</html>",
  ].join("\n");
}
