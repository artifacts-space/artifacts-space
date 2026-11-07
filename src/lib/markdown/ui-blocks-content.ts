import { fenced, indentContinuation, inlineText, link, linkTarget, quoted } from "./text";
import { boldTitle, heading, objectsOf, textOf, textsOf, type BlockContext, type BlockRenderer } from "./ui-props";

/*
 * Markdown for the layout, content, and media components of a ui spec.
 */

function titled({ props, level, children }: BlockContext): string[] {
  const title = textOf(props.title);
  const description = textOf(props.description);
  return [title ? heading(level, title) : null, description ?? null, ...children()].filter((block): block is string => Boolean(block));
}

/** Tabs and Accordion: each child under the heading its array item names. */
function paired(itemsKey: string, labelKey: string): BlockRenderer {
  return ({ props, level, child }) =>
    objectsOf(props[itemsKey]).flatMap((item, index) => {
      const label = textOf(item[labelKey]) ?? `Part ${String(index + 1)}`;
      return [heading(level, label), ...child(index)];
    });
}

const calloutAlerts: Record<string, string> = { info: "NOTE", success: "TIP", warning: "WARNING", danger: "CAUTION" };

function callout({ props }: BlockContext): string[] {
  const text = textOf(props.text) ?? "";
  const title = boldTitle(props.title);
  const alert = typeof props.tone === "string" ? calloutAlerts[props.tone] : undefined;
  const body = [alert ? `[!${alert}]` : null, title, text].filter((line): line is string => Boolean(line)).join("\n");
  return [quoted(body)];
}

function list({ props }: BlockContext): string[] {
  const items = textsOf(props.items);
  if (items.length === 0) return [];
  const ordered = props.ordered === true;
  return [items.map((item, index) => (ordered ? `${String(index + 1)}. ${indentContinuation(item, 3)}` : `- ${indentContinuation(item, 2)}`)).join("\n")];
}

function step(item: Record<string, unknown>, index: number): string {
  const parts = [`${String(index + 1)}. **${inlineText(textOf(item.title) ?? "")}**`];
  const body = textOf(item.body);
  if (body) parts.push(`   ${indentContinuation(body, 3)}`);
  const code = textOf(item.code);
  if (code) parts.push(`   ${indentContinuation(fenced(code, textOf(item.language) ?? ""), 3)}`);
  return parts.join("\n\n");
}

function steps({ props }: BlockContext): string[] {
  const items = objectsOf(props.items);
  return [boldTitle(props.title), items.length > 0 ? items.map(step).join("\n\n") : null].filter((block): block is string => Boolean(block));
}

function quote({ props }: BlockContext): string[] {
  const cite = textOf(props.cite);
  return [quoted([textOf(props.text) ?? "", ...(cite ? ["", `— ${inlineText(cite)}`] : [])].join("\n"))];
}

function code({ props }: BlockContext): string[] {
  return [boldTitle(props.title), fenced(textOf(props.code) ?? "", textOf(props.language) ?? "")].filter((block): block is string => Boolean(block));
}

function diagram({ props }: BlockContext): string[] {
  return [boldTitle(props.title), fenced(textOf(props.code) ?? "", "mermaid")].filter((block): block is string => Boolean(block));
}

function image({ props, fileLink }: BlockContext): string[] {
  const alt = inlineText(textOf(props.alt) ?? "").replace(/[[\]]/g, "");
  const file = typeof props.file === "string" ? fileLink(props.file) : null;
  const caption = textOf(props.caption);
  const picture = file ? `![${alt}](${linkTarget(file.url)})` : `_Image: ${alt || "no description"} (not available)_`;
  return [picture, caption ? `_${inlineText(caption)}_` : null].filter((block): block is string => Boolean(block));
}

function fileBlock({ props, fileLink }: BlockContext): string[] {
  const file = typeof props.file === "string" ? fileLink(props.file) : null;
  const label = textOf(props.label);
  if (!file) return [`_File: ${inlineText(label ?? "attachment")} (not available)_`];
  return [`File: ${link(label ?? file.name, file.url)}`];
}

function separator({ props }: BlockContext): string[] {
  const label = textOf(props.label);
  return ["---", ...(label ? [`**${inlineText(label)}**`] : [])];
}

function headingBlock({ props, level }: BlockContext): string[] {
  const text = textOf(props.text);
  if (!text) return [];
  const own = typeof props.level === "number" ? props.level : 1;
  return [heading(level + own - 1, text)];
}

/** Renderers for layout, content, and media components. */
export const contentBlocks: Record<string, BlockRenderer> = {
  Section: titled,
  Card: titled,
  Stack: ({ children }) => children(),
  Grid: ({ children }) => children(),
  Tabs: paired("tabs", "label"),
  Accordion: paired("items", "title"),
  Separator: separator,
  Heading: headingBlock,
  Text: ({ props }) => [textOf(props.text) ?? ""],
  Markdown: ({ props }) => [textOf(props.content) ?? ""],
  Code: code,
  Callout: callout,
  Badge: ({ props }) => [`\`${inlineText(textOf(props.label) ?? "").replaceAll("`", "'")}\``],
  List: list,
  Steps: steps,
  Link: ({ props }) => [link(textOf(props.label) ?? "", textOf(props.href) ?? "")],
  Quote: quote,
  Diagram: diagram,
  Image: image,
  File: fileBlock,
};
