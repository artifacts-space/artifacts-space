import Link from "next/link";

import { RegistryPage } from "@/components/docs/docs-page";
import { Playground } from "@/components/docs/playground";
import { docsMetadata } from "@/lib/docs/metadata";
import { docsHref } from "@/lib/docs/pages";
import { playgroundSeeds } from "@/lib/docs/playground-seeds";

export const metadata = docsMetadata("json-render/playground");

/** The playground: a client island inside a static page. */
export default function PlaygroundPage() {
  return (
    <RegistryPage slug="json-render/playground">
      <Playground seeds={playgroundSeeds} />
      <p className="mt-6 text-sm text-muted-foreground">
        Image and File elements need uploaded files, so they show a notice here. Everything else renders exactly as on an artifact page. New to specs? Read <Link href={docsHref("json-render")} className="underline underline-offset-2">Spec anatomy</Link> first.
      </p>
    </RegistryPage>
  );
}
