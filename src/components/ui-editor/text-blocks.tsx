"use client";

import dynamic from "next/dynamic";
import { Children, type ComponentType, type ReactNode } from "react";

import { badgeTone, headingClass, textSize, toneStyles } from "@/components/artifact-view/ui/content";
import { textLimit } from "@/lib/ui/block-templates";
import { componentProps, type UiComponentName, type UiProps } from "@/lib/ui/catalog";
import { cn } from "@/lib/utils";

import { addAfter, emptyText, removeBlock } from "./block-changes";
import { useBlockEditor } from "./block-editor-context";
import { EditableText } from "./editable-text";

/*
 * Blocks whose words you click and type into, drawn like their read-only
 * views in src/components/artifact-view/ui so the page looks the same while
 * it is edited. Data-shaped props (a callout's tone, a link's address) are
 * left to View source for now.
 */

interface BlockProps<K extends UiComponentName> {
  id: string;
  props: UiProps<K>;
  children?: ReactNode;
}

/** Enter in a block: a new empty line below it, focused. */
function useNewLineAfter(id: string) {
  const { apply } = useBlockEditor();
  return () => { apply((raw) => addAfter(raw, id, emptyText())); };
}

function HeadingBlock({ id, props }: BlockProps<"Heading">) {
  const { setProp } = useBlockEditor();
  const newLine = useNewLineAfter(id);
  const level = (props.level ?? 2) as keyof typeof headingClass;
  const tag = (["h1", "h2", "h3", "h4"] as const)[level - 1] ?? "h2";
  return (
    <EditableText
      as={tag}
      blockKey={id}
      value={props.text}
      onChange={(text) => { setProp(id, "text", text); }} maxLength={textLimit("Heading", "text")}
      onEnter={newLine}
      label="Heading"
      placeholder="Heading"
      className={cn("min-w-0 text-balance break-words", headingClass[level])}
    />
  );
}

function TextBlock({ id, props }: BlockProps<"Text">) {
  const { setProp, apply, openInsert } = useBlockEditor();
  const newLine = useNewLineAfter(id);
  return (
    <EditableText
      as="p"
      multiline
      blockKey={id}
      value={props.text}
      onChange={(text) => { setProp(id, "text", text); }} maxLength={textLimit("Text", "text")}
      onEnter={newLine}
      onSlash={(anchor) => { openInsert({ kind: "replace", key: id }, anchor); }}
      onEmptyBackspace={() => { apply((raw) => removeBlock(raw, id)); }}
      label="Text"
      placeholder="Type, or press / for blocks"
      className={cn("max-w-[var(--artifact-measure,72ch)] break-words", textSize[props.size ?? "md"], props.tone === "muted" && "text-muted-foreground")}
    />
  );
}

function CalloutBlock({ id, props }: BlockProps<"Callout">) {
  const { setProp } = useBlockEditor();
  const style = toneStyles[props.tone ?? "info"];
  return (
    <div role="note" className={cn("flex min-w-0 gap-3 rounded-md border px-4 py-3 shadow-xs", style.box)}>
      <style.Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.icon)} />
      <div className="min-w-0 flex-1 space-y-0.5 text-md leading-6">
        <EditableText blockKey={`${id}:title`} value={props.title ?? ""} onChange={(text) => { setProp(id, "title", text || undefined); }} maxLength={textLimit("Callout", "title")} label="Callout title" placeholder="Title" className="font-medium break-words" />
        <EditableText as="p" multiline blockKey={id} value={props.text} onChange={(text) => { setProp(id, "text", text); }} maxLength={textLimit("Callout", "text")} label="Callout text" placeholder="Note" className="break-words text-foreground/85" />
      </div>
    </div>
  );
}

function QuoteBlock({ id, props }: BlockProps<"Quote">) {
  const { setProp } = useBlockEditor();
  return (
    <figure className="min-w-0 border-l-2 pl-4">
      <EditableText as="blockquote" multiline blockKey={id} value={props.text} onChange={(text) => { setProp(id, "text", text); }} maxLength={textLimit("Quote", "text")} label="Quote" placeholder="Quote" className="text-md leading-7 break-words" />
      <figcaption className="mt-1.5 flex gap-1 text-sm text-muted-foreground">
        <span aria-hidden>—</span>
        <EditableText blockKey={`${id}:cite`} value={props.cite ?? ""} onChange={(text) => { setProp(id, "cite", text || undefined); }} maxLength={textLimit("Quote", "cite")} label="Quote source" placeholder="Source" className="min-w-0 break-words" />
      </figcaption>
    </figure>
  );
}

function BadgeBlock({ id, props }: BlockProps<"Badge">) {
  const { setProp } = useBlockEditor();
  return (
    <span className={cn("inline-flex h-5 w-fit max-w-full items-center rounded-full border px-2 text-xs font-medium", badgeTone[props.tone ?? "neutral"])}>
      <EditableText blockKey={id} value={props.label} onChange={(text) => { setProp(id, "label", text); }} maxLength={textLimit("Badge", "label")} label="Badge" placeholder="Label" className="min-h-0 whitespace-nowrap" />
    </span>
  );
}

function LinkBlock({ id, props }: BlockProps<"Link">) {
  const { setProp } = useBlockEditor();
  return (
    <span className="min-w-0 text-md break-words">
      <EditableText blockKey={id} value={props.label} onChange={(text) => { setProp(id, "label", text); }} maxLength={textLimit("Link", "label")} label={`Link text (opens ${props.href})`} placeholder="Link" className="inline-block underline decoration-border underline-offset-4" />
    </span>
  );
}

/** The longest list item the List schema takes. */
const listItemLimit = 1000;

/** List items: Enter adds an item after this one; Backspace in an empty item removes it. */
function ListBlock({ id, props }: BlockProps<"List">) {
  const { setProp } = useBlockEditor();
  const Tag = props.ordered ? "ol" : "ul";
  const items = props.items.length > 0 ? props.items : [""];
  const write = (next: string[]) => { setProp(id, "items", next); };
  return (
    <Tag className={cn("max-w-[var(--artifact-measure,72ch)] space-y-1 pl-5 text-md leading-7 marker:text-muted-foreground", props.ordered ? "list-decimal" : "list-disc")}>
      {items.map((item, index) => (
        // Items have no ids of their own; the index is their identity while typing.
        <li key={index}>
          <EditableText
            blockKey={index === 0 ? id : `${id}:${String(index)}`}
            value={item}
            onChange={(text) => { write(items.map((old, at) => (at === index ? text : old))); }}
            onEnter={() => { write([...items.slice(0, index + 1), "", ...items.slice(index + 1)]); }}
            maxLength={listItemLimit}
            onEmptyBackspace={items.length > 1 ? () => { write(items.filter((_, at) => at !== index)); } : undefined}
            label={`List item ${String(index + 1)}`}
            placeholder="List item"
            className="break-words"
          />
        </li>
      ))}
    </Tag>
  );
}

const titledStyles = {
  section: { frame: "gap-4", title: "text-lg font-medium tracking-[-0.01em] break-words", description: "text-md leading-6 text-muted-foreground break-words", body: "gap-4", tag: "h2", type: "Section" },
  card: { frame: "card-surface gap-3 p-4 sm:p-5", title: "text-base font-medium break-words", description: "text-sm leading-5 text-muted-foreground break-words", body: "gap-3", tag: "h3", type: "Card" },
} as const;

/** The editable title and description of a Section or Card, over its child blocks. */
function TitledBlock({ id, title, description, children, variant }: { id: string; title: string; description: string; children: ReactNode; variant: keyof typeof titledStyles }) {
  const { setProp } = useBlockEditor();
  const style = titledStyles[variant];
  return (
    <div className={cn("flex min-w-0 flex-col", style.frame)}>
      <div className="space-y-1">
        <EditableText as={style.tag} blockKey={id} value={title} onChange={(text) => { setProp(id, "title", text || undefined); }} maxLength={textLimit(style.type, "title")} label={`${style.type} title`} placeholder="Title" className={style.title} />
        <EditableText as="p" multiline blockKey={`${id}:description`} value={description} onChange={(text) => { setProp(id, "description", text || undefined); }} maxLength={textLimit(style.type, "description")} label={`${style.type} description`} placeholder="Description" className={style.description} />
      </div>
      {Children.count(children) > 0 ? <div className={cn("flex min-w-0 flex-col", style.body)}>{children}</div> : null}
    </div>
  );
}

function SectionBlock({ id, props, children }: BlockProps<"Section">) {
  return <TitledBlock id={id} title={props.title ?? ""} description={props.description ?? ""} variant="section">{children}</TitledBlock>;
}

function CardBlock({ id, props, children }: BlockProps<"Card">) {
  return <TitledBlock id={id} title={props.title ?? ""} description={props.description ?? ""} variant="card">{children}</TitledBlock>;
}

function CodeBlockField({ id, props }: BlockProps<"Code">) {
  const { setProp } = useBlockEditor();
  return (
    <textarea
      value={props.code}
      onChange={(event) => { setProp(id, "code", event.target.value); }}
      aria-label={props.title ? `Code: ${props.title}` : "Code"}
      spellCheck={false}
      placeholder="Code"
      className="block min-h-16 w-full resize-none rounded-lg border bg-muted/40 px-4 py-3 font-mono text-sm leading-6 field-sizing-content outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

/** The rich Markdown editor, loaded only when an interface has a Markdown block. */
const RichMarkdownEditor = dynamic(() => import("@/components/editor/rich-markdown-editor"), { ssr: false });

/**
 * A Markdown block in an interface. It holds text only (`media={false}`): a
 * ui artifact's saves attach only Image and File block files, so an upload
 * here would never attach. Media in Markdown blocks is a later phase.
 */
function MarkdownBlock({ id, props }: BlockProps<"Markdown">) {
  const { setProp } = useBlockEditor();
  return <RichMarkdownEditor value={props.content} onChange={(content) => { setProp(id, "content", content); }} label="Markdown" sourceToggle={false} media={false} />;
}

/** Blocks typed into in place, by component. Every other component renders its view and edits through View source. */
const editableBlocks: { [K in UiComponentName]?: ComponentType<BlockProps<K>> } = {
  Heading: HeadingBlock,
  Text: TextBlock,
  Callout: CalloutBlock,
  Quote: QuoteBlock,
  Badge: BadgeBlock,
  Link: LinkBlock,
  List: ListBlock,
  Section: SectionBlock,
  Card: CardBlock,
  Code: CodeBlockField,
  Markdown: MarkdownBlock,
};

/**
 * The in-place editor for a block, or null when its component has none or
 * its props do not pass their schema (the read-only view then shows what is
 * wrong, as it does for readers).
 */
export function renderEditableBlock(type: UiComponentName, id: string, props: Record<string, unknown>, children: ReactNode): ReactNode {
  const Block = editableBlocks[type] as ComponentType<BlockProps<UiComponentName>> | undefined;
  if (!Block) return null;
  const parsed = componentProps[type].safeParse(props);
  if (!parsed.success) return null;
  return <Block id={id} props={parsed.data}>{children}</Block>;
}
