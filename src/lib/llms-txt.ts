import { currentFormatKinds, earlierFormatKinds, formatInfo } from "@/lib/artifact-formats";
import { DOCS_REPOSITORY, docsHref, docsPages, docsSections, earlierFormatsSection, type DocsSectionName } from "@/lib/docs/pages";
import { mcpEndpoint } from "@/lib/setup/mcp-config";

/**
 * /llms.txt: what this site is and where its docs are, as Markdown for
 * language models (the llms.txt convention: one title, a quoted summary,
 * plain paragraphs and lists, then sections of links, the last one named
 * "Optional" for what a reader may skip).
 *
 * Built from the lists the site already keeps, so it cannot fall behind
 * them: the docs pages (src/lib/docs/pages.ts), the formats
 * (src/lib/artifact-formats.ts), and the MCP endpoint. Pure, so it is
 * tested; the route in src/app/llms.txt only calls it.
 */

/** One link line: `- [Title](URL): what it holds`. */
function link(title: string, url: string, about: string): string {
  return `- [${title}](${url}): ${about}`;
}

/** The link lines for the docs pages of one section, in reading order. */
function docsLinks(section: DocsSectionName, origin: string): string[] {
  return docsPages.filter((page) => page.section === section).map((page) => link(page.title, new URL(docsHref(page.slug), origin).href, page.description));
}

/** A section of links under its heading, with a blank line after it. */
function linkSection(heading: string, links: readonly string[]): string[] {
  return [`## ${heading}`, "", ...links, ""];
}

const listWords = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** The names of the earlier formats as inline code, as a list in words: "`ui` and `canvas`". */
function earlierFormatNames(): string {
  return listWords.format(earlierFormatKinds.map((kind) => `\`${kind}\``));
}

/** The llms.txt body for a site at `origin`. */
export function llmsTxtFor(origin: string): string {
  const at = (path: string) => new URL(path, origin).href;
  const currentSections = docsSections.filter((section) => section !== earlierFormatsSection);
  return [
    "# artifacts.space",
    "",
    "> artifacts.space is a workspace where any agent, from any lab, saves docs, plans, reports, and web pages. People and agents read, edit, comment on, and share the same artifacts.",
    "",
    `Agents connect over MCP at ${mcpEndpoint(origin)}. Most clients need only that URL and a browser sign-in. There is no SDK to install.`,
    "",
    "Every artifact has one format, its `kind`. Use `markdown` for prose. Use `html` for anything visual or interactive: a mockup, a prototype, a dashboard, a report with charts.",
    "",
    ...currentFormatKinds.map((kind) => `- \`${kind}\`: ${formatInfo[kind].helper}`),
    "",
    `${earlierFormatNames()} are earlier formats, kept for the artifacts that use them. Their docs are under Optional.`,
    "",
    "An artifact is private until its author shares it: with a team, by link, or in public. Each artifact keeps a version history.",
    "",
    "Every artifact link also answers as Markdown: add `.md` to the link, or send `Accept: text/markdown`.",
    "",
    ...currentSections.flatMap((section) => linkSection(section, docsLinks(section, origin))),
    ...linkSection("Project", [
      link("Source code", DOCS_REPOSITORY, "The code of this site, to read or to run yourself."),
      link("Support", at("/support"), "How to get help."),
    ]),
    ...linkSection("Optional", [
      ...docsLinks(earlierFormatsSection, origin),
      link("Privacy", at("/privacy"), "What the site stores and why."),
      link("Terms", at("/terms"), "The rules for using the site."),
    ]),
  ].join("\n");
}
