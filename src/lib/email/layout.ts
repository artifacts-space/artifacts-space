import { siteUrl } from "@/lib/site-origin";

/**
 * The one branded frame for every transactional email: logo and wordmark,
 * a card with the message and one button, and a quiet footer.
 *
 * Email clients cannot read the site's CSS tokens, so this palette copies the
 * neutral tokens in `src/app/globals.css` as literal hex values. Keep the two
 * in step. Brand blue lives only in the logo image.
 */
export const EMAIL_COLORS = {
  light: { page: "#fbfaf8", card: "#ffffff", border: "#e1dfdc", ink: "#181513", muted: "#67625d", buttonText: "#fbfaf8" },
  dark: { page: "#100e0d", card: "#151312", border: "#2c2b2a", ink: "#e9e7e5", muted: "#95918d", buttonText: "#100e0d" },
} as const;

/** The site's sans (Satoshi) first, then system fonts, since most mail apps do not load web fonts. */
const FONT_STACK = "'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SITE_NAME = "artifacts.space";
/** A 96 px file shown at 48 px, so it stays sharp on high-density screens. */
export const EMAIL_LOGO_PATH = "/email/artifacts-space-icon.png";
const LOGO_SIZE = 48;

/** HTML that is safe to place in an email. Build it with `html`, never by hand. */
export interface SafeHtml {
  readonly safeHtml: string;
}

export interface EmailContent {
  /** Plain text for the HTML title. */
  title: string;
  /** Plain text that inbox lists show beside the subject. */
  preview: string;
  heading: SafeHtml;
  paragraphs: readonly SafeHtml[];
  action: { label: string; url: string };
  /** Small print under the button, inside the card. */
  note?: SafeHtml;
  /** One plain sentence in the footer: why the person got this email. */
  reason: string;
  /** The plain-text body. The layout adds the same footer as the HTML. */
  text: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/** Escapes text for HTML content and double- or single-quoted attributes. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const SITE_NAME_PATTERN = /(?<![\w.@-])artifacts\.space(?![\w-]|\.[\w-])/g;

type Tone = "ink" | "muted";

/** The site name as a quiet link to the site. Mail apps would otherwise auto-link it in blue. */
function siteNameLink(tone: Tone): string {
  const color = EMAIL_COLORS.light[tone];
  return `<a href="${escapeHtml(siteUrl("/"))}" class="em-${tone}" style="color:${color};text-decoration:none">${SITE_NAME}</a>`;
}

/** Escapes copy and turns each "artifacts.space" into a quiet site link. */
function copy(text: string, tone: Tone = "ink"): string {
  return escapeHtml(text).replace(SITE_NAME_PATTERN, () => siteNameLink(tone));
}

/**
 * Builds email HTML from a template. Every interpolated string is escaped, so
 * user text (names, titles, team names) can never add markup. `SafeHtml`
 * values, such as `emailLink`, go in as they are. In the template's own
 * copy, "artifacts.space" becomes a quiet link to the site.
 */
export function html(strings: TemplateStringsArray, ...values: (string | SafeHtml)[]): SafeHtml {
  let out = "";
  strings.forEach((literal, index) => {
    out += copy(literal);
    const value = values[index];
    if (value === undefined) return;
    out += typeof value === "string" ? escapeHtml(value) : value.safeHtml;
  });
  return { safeHtml: out };
}

/** An inline text link, in the body color and underlined. */
export function emailLink(url: string, label: string): SafeHtml {
  const color = EMAIL_COLORS.light.ink;
  return { safeHtml: `<a href="${escapeHtml(url)}" class="em-ink" style="color:${color};text-decoration:underline">${escapeHtml(label)}</a>` };
}

/** The absolute URL of the email logo, on this site's origin. */
export function emailLogoUrl(): string {
  return siteUrl(EMAIL_LOGO_PATH);
}

const DARK = EMAIL_COLORS.dark;
const STYLE = [
  ":root{color-scheme:light dark;supported-color-schemes:light dark}",
  "body{margin:0;padding:0;-webkit-text-size-adjust:100%}",
  "@media (max-width:480px){.em-card{padding:28px 20px !important}}",
  "@media (prefers-color-scheme:dark){",
  `.em-page{background-color:${DARK.page} !important}`,
  `.em-card{background-color:${DARK.card} !important;border-color:${DARK.border} !important}`,
  `.em-ink{color:${DARK.ink} !important}`,
  `.em-muted{color:${DARK.muted} !important}`,
  `.em-button{background-color:${DARK.ink} !important}`,
  `.em-button-text{color:${DARK.buttonText} !important}`,
  "}",
].join("\n");

const LIGHT = EMAIL_COLORS.light;
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

function renderHeader(): string {
  const home = escapeHtml(siteUrl("/"));
  const logo = `<img src="${escapeHtml(emailLogoUrl())}" width="${String(LOGO_SIZE)}" height="${String(LOGO_SIZE)}" alt="${SITE_NAME}" style="display:block;width:${String(LOGO_SIZE)}px;height:${String(LOGO_SIZE)}px;border:0;outline:none">`;
  return `<table ${TABLE}><tr>
<td style="vertical-align:middle;padding:0 10px 0 0"><a href="${home}" style="text-decoration:none">${logo}</a></td>
<td class="em-ink" style="vertical-align:middle;font-family:${FONT_STACK};font-size:17px;line-height:24px;font-weight:500;letter-spacing:-0.01em;color:${LIGHT.ink}">${siteNameLink("ink")}</td>
</tr></table>`;
}

function renderButton({ label, url }: EmailContent["action"]): string {
  return `<table ${TABLE} style="margin:28px 0 0"><tr>
<td class="em-button" bgcolor="${LIGHT.ink}" style="border-radius:6px;background-color:${LIGHT.ink}"><a class="em-button-text" href="${escapeHtml(url)}" style="display:inline-block;padding:11px 18px;border-radius:6px;font-family:${FONT_STACK};font-size:14px;line-height:20px;font-weight:500;color:${LIGHT.buttonText};text-decoration:none">${escapeHtml(label)}</a></td>
</tr></table>`;
}

function renderCard(content: EmailContent): string {
  const heading = `<h1 class="em-ink" style="margin:0 0 12px;font-family:${FONT_STACK};font-size:22px;line-height:30px;font-weight:500;letter-spacing:-0.01em;color:${LIGHT.ink}">${content.heading.safeHtml}</h1>`;
  const paragraphs = content.paragraphs
    .map((paragraph) => `<p class="em-muted" style="margin:12px 0 0;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:${LIGHT.muted}">${paragraph.safeHtml}</p>`)
    .join("\n");
  const note = content.note
    ? `<p class="em-muted" style="margin:28px 0 0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${LIGHT.muted}">${content.note.safeHtml}</p>`
    : "";
  return `${heading}\n${paragraphs}\n${renderButton(content.action)}\n${note}`;
}

function renderFooter(reason: string): string {
  return `<td class="em-muted" style="padding:20px 4px 0;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${LIGHT.muted}">${copy(reason, "muted")}<br>${siteNameLink("muted")}</td>`;
}

/** Hidden text that inbox lists show as the preview line, padded so body text does not follow it. */
function renderPreview(preview: string): string {
  const padding = "&#847;&zwnj;&nbsp;".repeat(40);
  return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preview)}${padding}</div>`;
}

function renderHtml(content: EmailContent): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.title)}</title>
<style>
${STYLE}
</style>
</head>
<body class="em-page" style="margin:0;padding:0;background-color:${LIGHT.page}">
${renderPreview(content.preview)}
<table ${TABLE} width="100%" class="em-page" style="width:100%;background-color:${LIGHT.page}"><tr><td align="center" style="padding:40px 16px">
<table ${TABLE} width="100%" style="width:100%;max-width:520px">
<tr><td style="padding:0 0 20px">${renderHeader()}</td></tr>
<tr><td class="em-card" style="padding:36px 32px;background-color:${LIGHT.card};border:1px solid ${LIGHT.border};border-radius:8px">
${renderCard(content)}
</td></tr>
<tr>${renderFooter(content.reason)}</tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function renderText(content: EmailContent): string {
  return `${content.text}\n\n--\n${content.reason}\n${SITE_NAME}: ${siteUrl("/")}`;
}

/**
 * Renders one email in the shared branded layout, as HTML and plain text.
 * Links are absolute and built from the site origin, never from a request.
 */
export function renderEmail(content: EmailContent): RenderedEmail {
  return { html: renderHtml(content), text: renderText(content) };
}
