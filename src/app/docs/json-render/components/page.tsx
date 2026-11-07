import Link from "next/link";

import { InlineCodeText } from "@/components/docs/docs-content";
import { RegistryPage } from "@/components/docs/docs-page";
import { componentDescription, componentGroups } from "@/lib/docs/components/catalog-docs";
import { docsMetadata } from "@/lib/docs/metadata";
import { componentHref } from "@/lib/docs/navigation";

export const metadata = docsMetadata("json-render/components");

/** The first sentence of a catalog description, for the index cards. */
function firstSentence(text: string): string {
  const end = text.search(/\.\s/);
  return end === -1 ? text : text.slice(0, end + 1);
}

/** Every component, by group, with its one-line description from the catalog. */
export default function ComponentsIndexPage() {
  return (
    <RegistryPage slug="json-render/components">
      <div className="space-y-12">
        {componentGroups.map((group) => (
          <section key={group.name} aria-labelledby={`group-${group.name}`}>
            <h2 id={`group-${group.name}`} className="text-xl font-medium tracking-[-0.01em]">{group.name}</h2>
            <p className="mt-1 text-md text-muted-foreground">{group.summary}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.components.map((name) => (
                <li key={name}>
                  <Link href={componentHref(name)} className="card-surface card-hover block h-full px-4 py-3">
                    <span className="block font-mono text-sm font-medium">{name}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground"><InlineCodeText text={firstSentence(componentDescription(name))} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </RegistryPage>
  );
}
