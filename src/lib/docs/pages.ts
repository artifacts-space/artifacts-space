/**
 * Every docs page, in reading order. The sidebar, prev/next links, search,
 * page metadata, and "On this page" all read this list, so a page and its
 * headings are named in one place. Server- and client-safe: no React.
 */

/** One heading on a page, linked by its `id`. */
export interface DocsHeading {
  id: string;
  title: string;
  /** 2 for a section, 3 for a subsection. */
  level: 2 | 3;
}

/** One docs page. */
export interface DocsPage {
  /** Path after /docs, such as "quickstart". Empty for the introduction. */
  slug: string;
  title: string;
  /** One sentence for the page lead, search results, and the meta description. */
  description: string;
  section: DocsSectionName;
  /** The file to edit on GitHub, from the repository root. */
  source: string;
  headings: readonly DocsHeading[];
  /** Pages that need the full width hide "On this page". */
  wide?: boolean;
}

export const docsSections = ["Get started", "Reference", "JSON Render", "Work together", "Run it"] as const;
export type DocsSectionName = (typeof docsSections)[number];

const h2 = (id: string, title: string): DocsHeading => ({ id, title, level: 2 });
const h3 = (id: string, title: string): DocsHeading => ({ id, title, level: 3 });

const app = (path: string) => `src/app/docs/${path}page.tsx`;

export const docsPages = [
  {
    slug: "",
    title: "Introduction",
    description: "artifacts.space is the collaboration space for humans and agents. Agents save their work as artifacts; people read, edit, and share them.",
    section: "Get started",
    source: app(""),
    headings: [
      h2("why", "Why it exists"),
      h2("artifacts", "Artifacts"),
      h2("formats", "Formats"),
      h2("visibility", "Visibility and sharing"),
      h2("teams", "Teams and agent teammates"),
      h2("approval", "Approval"),
      h2("comments", "Comments and mentions"),
      h2("history", "Version history"),
      h2("next", "Where to go next"),
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    description: "Connect your coding agent over MCP and save your first artifact in about two minutes.",
    section: "Get started",
    source: app("quickstart/"),
    headings: [
      h2("connect", "Connect your agent"),
      h2("tokens", "Tokens for CI and headless agents"),
      h2("skill", "Add the agent skill"),
      h2("default", "Make it the default"),
      h2("first-artifact", "Save your first artifact"),
      h2("first-ui", "Make a rich page"),
      h2("troubleshooting", "Troubleshooting"),
    ],
  },
  {
    slug: "clients",
    title: "Client setup",
    description: "Connect Claude Code, Cursor, Claude Desktop, ChatGPT, Codex, OpenCode, Devin, Kimi Code CLI, fx, or any MCP client. Most need only the URL and a browser sign-in.",
    section: "Get started",
    source: app("clients/"),
    headings: [
      h2("claude-code", "Claude Code"),
      h2("cursor", "Cursor"),
      h2("claude-desktop", "Claude Desktop and claude.ai"),
      h2("chatgpt", "ChatGPT"),
      h2("codex", "Codex"),
      h2("opencode", "OpenCode"),
      h2("devin", "Devin"),
      h2("kimi-code", "Kimi Code CLI"),
      h2("fx", "fx"),
      h2("other-clients", "Other clients"),
      h2("headless", "Headless and CI"),
      h2("default", "Make it the default"),
    ],
  },
  {
    slug: "mcp",
    title: "MCP reference",
    description: "Every tool on the artifacts.space MCP server, with its arguments, access level, results, and errors. Generated from the server code.",
    section: "Reference",
    source: "src/lib/mcp/tool-access.ts",
    headings: [
      h2("endpoint", "Endpoint and transport"),
      h2("auth", "Authentication and scopes"),
      h3("read-only", "Read-only connections"),
      h2("tools", "Tools"),
      h2("errors", "Errors"),
      h3("rate-limits", "Rate limits"),
      h2("untrusted", "Untrusted content"),
      h2("markdown", "Read artifacts without MCP"),
    ],
  },
  {
    slug: "formats",
    title: "Formats",
    description: "The nine artifact formats: what each holds, how it is checked, how it renders, and its limits.",
    section: "Reference",
    source: app("formats/"),
    headings: [
      h2("overview", "Overview"),
      h2("limits", "Size limits"),
      h2("markdown", "Markdown"),
      h2("code", "Code"),
      h2("text", "Text"),
      h2("json", "JSON"),
      h2("csv", "CSV"),
      h2("svg", "SVG"),
      h2("mermaid", "Mermaid"),
      h2("ui", "Interface (ui)"),
      h2("file", "Files"),
    ],
  },
  {
    slug: "themes",
    title: "Themes",
    description: "Give an artifact its own colors, fonts, and a cover, in the web app or over MCP. Every theme passes contrast checks, so every reader can read it.",
    section: "Reference",
    source: app("themes/"),
    headings: [
      h2("overview", "What a theme changes"),
      h2("presets", "Presets"),
      h2("artifact", "Set an artifact's theme"),
      h3("web", "On the artifact page"),
      h3("custom-theme", "Custom themes"),
      h3("new", "For a new artifact"),
      h3("mcp", "Over MCP"),
      h3("themes-list", "themes_list"),
      h3("history", "History and approval"),
      h2("team", "Team themes"),
      h3("resolution", "Which theme shows"),
      h3("team-presets", "Team presets"),
      h3("import-export", "Import and export"),
      h3("team-default", "The team default"),
      h3("team-mcp", "Team themes over MCP"),
      h2("covers", "Covers"),
      h3("cover-gradients", "Gradients"),
      h3("cover-web", "Add a cover on the page"),
      h3("cover-mcp", "Covers over MCP"),
      h3("cover-images", "Cover images"),
      h3("cover-history", "Cover history and approval"),
      h2("outside", "Outside the page"),
      h3("markdown", "Markdown"),
      h3("previews", "Link previews"),
      h2("tokens", "Theme JSON"),
      h3("colors", "Colors"),
      h3("radius", "Radius"),
      h3("fonts", "Fonts"),
      h3("mode", "Light, dark, and mode locks"),
      h3("limits", "Size limits"),
      h2("validation", "Validation"),
      h2("contrast", "Contrast"),
      h3("suggestions", "Suggested colors"),
      h2("example", "A full theme"),
      h2("vendoring", "How fonts load"),
    ],
  },
  {
    slug: "json-render",
    title: "JSON Render",
    description: "Build dashboards, reports, and runbooks as ui artifacts: one JSON spec on the stout component set, rendered the same for every reader.",
    section: "JSON Render",
    source: app("json-render/"),
    headings: [
      h2("how", "How it works"),
      h2("anatomy", "Spec anatomy"),
      h3("version", "version"),
      h3("root-elements", "root and elements"),
      h3("children", "children"),
      h3("state", "state"),
      h2("minimal", "A minimal spec"),
      h2("dashboard", "A full dashboard"),
      h2("catalog", "The component set"),
    ],
  },
  {
    slug: "json-render/components",
    title: "Components",
    description: "All components in the stout set, by group. Each page has its props, limits, and live examples.",
    section: "JSON Render",
    source: app("json-render/components/"),
    headings: [],
  },
  {
    slug: "json-render/dynamic",
    title: "Dynamic props and actions",
    description: "Read and write on-page state with $state, $bindState, $template, $cond, visible, repeat, and the four state actions.",
    section: "JSON Render",
    source: app("json-render/dynamic/"),
    headings: [
      h2("state", "$state: read state"),
      h2("bind-state", "$bindState: two-way inputs"),
      h2("template", "$template: text with values"),
      h2("cond", "$cond: pick a value"),
      h2("visible", "visible: show and hide"),
      h2("repeat", "repeat and $item: lists from state"),
      h2("actions", "Actions"),
      h3("set-state", "setState"),
      h3("push-remove", "pushState and removeState"),
      h3("validate-form", "validateForm"),
      h2("unsupported", "What is not supported"),
    ],
  },
  {
    slug: "json-render/charts",
    title: "Charts",
    description: "Bar, line, area, pie, donut, and scatter charts: data shapes, stacking and grouping, number formats, and currency rules.",
    section: "JSON Render",
    source: app("json-render/charts/"),
    headings: [
      h2("cartesian", "Bar, line, and area"),
      h3("grouped", "Grouped bars"),
      h3("stacked", "Stacked bars and areas"),
      h3("gaps", "Gaps and negatives"),
      h2("pie", "Pie and donut"),
      h2("scatter", "Scatter"),
      h2("formats", "Number formats"),
      h2("currency", "Currency"),
      h2("rules", "Chart rules"),
    ],
  },
  {
    slug: "json-render/validation",
    title: "Validation",
    description: "The checks every ui spec passes, the messages agents get back, and how artifacts_validate catches problems before saving.",
    section: "JSON Render",
    source: app("json-render/validation/"),
    headings: [
      h2("when", "When validation runs"),
      h2("validate-tool", "artifacts_validate"),
      h2("errors-warnings", "Errors and warnings"),
      h2("examples", "Real messages"),
      h2("limits", "Spec limits"),
      h2("codes", "Issue codes"),
    ],
  },
  {
    slug: "json-render/guarantees",
    title: "Stout guarantees",
    description: "What the stout component set promises: bounded props, no free-form CSS, per-element error boundaries, versioned specs, and themes that just work.",
    section: "JSON Render",
    source: app("json-render/guarantees/"),
    headings: [
      h2("bounded", "Bounded props"),
      h2("no-css", "No free-form CSS"),
      h2("isolation", "Per-element error boundaries"),
      h2("versions", "Versioned specs"),
      h2("safety", "Nothing runs, nothing loads"),
      h2("themes", "Themes, light and dark, and small screens"),
    ],
  },
  {
    slug: "json-render/playground",
    title: "Playground",
    description: "Write a ui spec and see it render as you type, with the same validator and renderer the site uses. Nothing is saved.",
    section: "JSON Render",
    source: app("json-render/playground/"),
    headings: [],
    wide: true,
  },
  {
    slug: "json-render/prompting",
    title: "Prompting your agent",
    description: "What to tell a coding agent so it writes good ui artifacts the first time.",
    section: "JSON Render",
    source: app("json-render/prompting/"),
    headings: [
      h2("guide", "Start with the formats guide"),
      h2("prompt", "A prompt that works"),
      h2("habits", "Good habits"),
      h2("ideas", "Ideas to try"),
    ],
  },
  {
    slug: "sharing",
    title: "Sharing, teams, and agents",
    description: "Visibility, team sharing and approval, agent teammates and their tokens, mentions and the inbox, comments, and version history.",
    section: "Work together",
    source: app("sharing/"),
    headings: [
      h2("visibility", "Visibility"),
      h2("teams", "Teams and roles"),
      h2("approval", "Approval"),
      h3("edits", "Edits to shared artifacts"),
      h2("agents", "Agent teammates"),
      h3("agent-tokens", "Agent tokens"),
      h2("mentions", "Mentions and the inbox"),
      h2("comments-setting", "Who can comment"),
      h2("history", "Version history and restore"),
    ],
  },
  {
    slug: "limits",
    title: "Limits and quotas",
    description: "Rate limits, storage quotas, file limits, team size, and the daily email budget, read straight from the code.",
    section: "Run it",
    source: app("limits/"),
    headings: [
      h2("rate-limits", "Rate limits"),
      h2("storage", "Storage quota"),
      h2("artifact-size", "Artifact and spec size"),
      h2("files", "Files"),
      h2("teams", "Team size"),
      h2("email", "Email budget"),
      h2("comments", "Comment guardrails"),
    ],
  },
  {
    slug: "self-hosting",
    title: "Self-hosting",
    description: "Run your own artifacts.space on Vercel with Neon Postgres, Better Auth, GitHub sign-in, Cloudflare R2, and Sendir.",
    section: "Run it",
    source: app("self-hosting/"),
    headings: [
      h2("stack", "What you need"),
      h2("env", "Environment variables"),
      h2("database", "Database and migrations"),
      h2("auth", "Sign-in"),
      h2("files", "File storage on R2"),
      h2("email", "Email with Sendir"),
      h2("vercel", "Deploy on Vercel"),
      h2("local", "Run it locally"),
    ],
  },
] as const satisfies readonly DocsPage[];

export type DocsSlug = (typeof docsPages)[number]["slug"];

/** The URL of a docs page, with an optional heading anchor. */
export function docsHref(slug: string, anchor?: string): string {
  const path = slug ? `/docs/${slug}` : "/docs";
  return anchor ? `${path}#${anchor}` : path;
}

const bySlug = new Map<string, DocsPage>(docsPages.map((page) => [page.slug, page]));

/** The page with this slug. Throws for an unknown slug, so a typo fails the build. */
export function docsPage(slug: DocsSlug): DocsPage {
  const page = bySlug.get(slug);
  if (!page) throw new Error(`Unknown docs page "${slug}".`);
  return page;
}

/** The heading with this id on a page. Throws when the page does not list it. */
export function docsHeading(slug: DocsSlug, id: string): DocsHeading {
  const heading = docsPage(slug).headings.find((item) => item.id === id);
  if (!heading) throw new Error(`Docs page "${slug}" has no heading "${id}". Add it to src/lib/docs/pages.ts.`);
  return heading;
}

/** The repository the "Edit this page" links point at. */
export const DOCS_REPOSITORY = "https://github.com/artifacts-space/artifacts-space";

/** The GitHub edit URL for a source file. */
export function editUrl(source: string): string {
  return `${DOCS_REPOSITORY}/edit/main/${source}`;
}
