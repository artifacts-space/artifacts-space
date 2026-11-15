"use client";

import { ArtifactFilesProvider } from "@/components/artifact-view/files-context";
import { UiView } from "@/components/artifact-view/ui-view";
import { useHydrated } from "@/components/use-hydrated";
import { docsExampleFiles } from "@/lib/docs/spec-builders";

/** Docs examples are not uploaded: Image elements show the planet mark instead. */
const standInUrl = () => "/artifacts-space-icon.png";

/**
 * Renders an example spec with the real ui renderer and stout registry, the
 * same path an artifact page takes. Media elements see two stand-in files.
 * `data-example-ready` says when React has taken it over, so a test presses
 * its buttons only once a press is answered; the wrapper draws no box.
 */
export function ExamplePreview({ json }: { json: string }) {
  const hydrated = useHydrated();
  return (
    <ArtifactFilesProvider files={docsExampleFiles} urlFor={standInUrl}>
      <div className="contents" data-example-ready={hydrated ? "" : undefined}>
        <UiView content={json} />
      </div>
    </ArtifactFilesProvider>
  );
}
