"use client";

import { ArtifactFilesProvider } from "@/components/artifact-view/files-context";
import { UiView } from "@/components/artifact-view/ui-view";
import { docsExampleFiles } from "@/lib/docs/spec-builders";

/** Docs examples are not uploaded: Image elements show the planet mark instead. */
const standInUrl = () => "/artifacts-space-icon.png";

/**
 * Renders an example spec with the real ui renderer and stout registry, the
 * same path an artifact page takes. Media elements see two stand-in files.
 */
export function ExamplePreview({ json }: { json: string }) {
  return (
    <ArtifactFilesProvider files={docsExampleFiles} urlFor={standInUrl}>
      <UiView content={json} />
    </ArtifactFilesProvider>
  );
}
