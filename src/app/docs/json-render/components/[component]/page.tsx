import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AnchorHeading, Code, InlineCodeText, Prose } from "@/components/docs/docs-content";
import { DocsPage } from "@/components/docs/docs-page";
import { LiveExample, PropsTable } from "@/components/docs/live-example";
import { componentBySlug, componentDescription, componentDocs, componentSlug, groupOf } from "@/lib/docs/components/catalog-docs";
import { componentHref } from "@/lib/docs/navigation";
import { docsHref, type DocsHeading } from "@/lib/docs/pages";
import { propRows } from "@/lib/docs/prop-rows";
import { componentEvents, componentProps, containerComponents, uiComponentNames, type UiComponentName } from "@/lib/ui/catalog";

/** One page per catalog component, all built at build time. */
export function generateStaticParams() {
  return uiComponentNames.map((name) => ({ component: componentSlug(name) }));
}

const groupSources: Record<string, string> = {
  Layout: "src/lib/docs/components/layout-content.ts",
  Content: "src/lib/docs/components/layout-content.ts",
  Data: "src/lib/docs/components/data.ts",
  Planning: "src/lib/docs/components/data.ts",
  Inputs: "src/lib/docs/components/inputs-media.ts",
  Media: "src/lib/docs/components/inputs-media.ts",
};

async function componentFrom(params: PageProps<"/docs/json-render/components/[component]">["params"]): Promise<UiComponentName | null> {
  const { component } = await params;
  return componentBySlug(component);
}

export async function generateMetadata({ params }: PageProps<"/docs/json-render/components/[component]">): Promise<Metadata> {
  const name = await componentFrom(params);
  if (!name) return {};
  return {
    title: `${name} component`,
    description: componentDescription(name).replaceAll("`", ""),
    alternates: { canonical: componentHref(name) },
  };
}

function headingsFor(name: UiComponentName): DocsHeading[] {
  const headings: DocsHeading[] = [{ id: "examples", title: "Examples", level: 2 }, { id: "props", title: "Props", level: 2 }];
  if (componentDocs[name].rules?.length) headings.push({ id: "rules", title: "Rules", level: 2 });
  headings.push({ id: "children", title: containerComponents.has(name) ? "Children" : "Children and events", level: 2 });
  return headings;
}

function ChildrenAndEvents({ name }: { name: UiComponentName }) {
  const events = componentEvents[name] ?? [];
  return (
    <Prose>
      <p>
        {containerComponents.has(name)
          ? <>{name} shows its <code>children</code>, in order.</>
          : <>{name} is a leaf: it does not show <code>children</code>. Validation warns when a leaf has some; wrap them in a Stack or Card instead.</>}
      </p>
      {events.length > 0 ? (
        <p>
          Events: {events.map((event) => <code key={event}>{event}</code>)}. Bind one with <code>on</code> to run a state action; see <Link href={docsHref("json-render/dynamic", "actions")}>Actions</Link>.
        </p>
      ) : (
        <p>It emits no events.</p>
      )}
    </Prose>
  );
}

/** Holds the page's place while the component name resolves on a client navigation. */
function ComponentSkeleton() {
  return (
    <div className="max-w-[780px] animate-pulse pt-10" aria-hidden="true">
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="mt-3 h-9 w-48 rounded bg-muted" />
      <div className="mt-5 h-16 rounded bg-muted" />
      <div className="mt-10 h-72 rounded-lg bg-muted" />
    </div>
  );
}

/** A component's reference: live examples, the props table from its zod schema, and its rules. */
export default function ComponentPage({ params }: PageProps<"/docs/json-render/components/[component]">) {
  return (
    <Suspense fallback={<ComponentSkeleton />}>
      <ComponentReference params={params} />
    </Suspense>
  );
}

async function ComponentReference({ params }: { params: PageProps<"/docs/json-render/components/[component]">["params"] }) {
  const name = await componentFrom(params);
  if (!name) notFound();
  const doc = componentDocs[name];
  const group = groupOf(name);
  return (
    <DocsPage href={componentHref(name)} eyebrow={`Components · ${group.name}`} title={name} description={<InlineCodeText text={componentDescription(name)} />} source={groupSources[group.name] ?? "src/lib/ui/catalog.ts"} headings={headingsFor(name)}>
      <AnchorHeading heading={{ id: "examples", title: "Examples", level: 2 }} />
      {doc.examples.map((example) => <LiveExample key={example.title} example={example} />)}
      <AnchorHeading heading={{ id: "props", title: "Props", level: 2 }} />
      <Prose>
        <p>Generated from the zod schema the server validates with. Unknown props are ignored with a warning. Any prop can also be a dynamic value such as <Code>{"{ \"$state\": \"/path\" }"}</Code>; it is checked again once it resolves.</p>
      </Prose>
      <PropsTable rows={propRows(componentProps[name])} />
      {doc.rules?.length ? (
        <>
          <AnchorHeading heading={{ id: "rules", title: "Rules", level: 2 }} />
          <Prose><ul>{doc.rules.map((rule) => <li key={rule}><InlineCodeText text={rule} /></li>)}</ul></Prose>
        </>
      ) : null}
      <AnchorHeading heading={headingsFor(name).at(-1) ?? { id: "children", title: "Children", level: 2 }} />
      <ChildrenAndEvents name={name} />
    </DocsPage>
  );
}
