"use client";

import { useState } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import RichMarkdownEditor from "@/components/editor/rich-markdown-editor";

/**
 * Development only: Mermaid diagrams in a Markdown document, with no
 * database. The read view draws one diagram that works and one that cannot
 * be drawn; the rich editor below holds a diagram to edit, and the Markdown
 * it would save shows under it. The markdown-mermaid e2e test reads both.
 */

export const readFixtureMarkdown = `# Diagram fixture

How a change ships.

\`\`\`mermaid
flowchart TD
  A[Agent drafts] --> B{Reviewed?}
  B -->|Yes| C[Publish]
  B -->|No| A
\`\`\`

A diagram with a mistake:

\`\`\`mermaid
flowchart TD
  A -- > B
\`\`\`

Plain code stays code:

\`\`\`ts
const answer = 42;
\`\`\`
`;

export const editorFixtureMarkdown = `# Editor diagram

Intro paragraph.

\`\`\`mermaid
flowchart LR
  Plan --> Build
\`\`\`

End paragraph.
`;

/** See the notes at the top of this file. */
export function MermaidFixture() {
  const [markdown, setMarkdown] = useState(editorFixtureMarkdown);
  return (
    <main className="mx-auto w-full max-w-[72ch] px-4 py-10">
      <section aria-label="Read view">
        <ArtifactView kind="markdown" content={readFixtureMarkdown} title="Diagram fixture" />
      </section>
      <section aria-label="Editor" className="mt-12">
        <RichMarkdownEditor value={markdown} onChange={setMarkdown} label="Artifact content" />
        <h2 className="mt-10 text-lg font-medium">Saved Markdown</h2>
        <pre data-testid="fixture-markdown" className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm whitespace-pre-wrap">{markdown}</pre>
      </section>
    </main>
  );
}
