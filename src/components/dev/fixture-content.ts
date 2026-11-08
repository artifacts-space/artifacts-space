import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { specJson, type DocElement } from "@/lib/docs/spec-builders";
import { checkoutRolloutSpec } from "@/lib/preview/samples";

/** The rollout dashboard twelve times over: a long ui with charts, timelines, and tables. */
export function longUi(): string {
  const elements: Record<string, DocElement> = {};
  const sections: string[] = [];
  for (let copy = 0; copy < 12; copy++) {
    for (const [key, element] of Object.entries(checkoutRolloutSpec.elements)) {
      const children = element.children?.map((child) => `${child}-${String(copy)}`);
      elements[`${key}-${String(copy)}`] = children ? { ...element, children } : element;
    }
    sections.push(`page-${String(copy)}`);
  }
  elements.root = { type: "Stack", props: { gap: "lg" }, children: sections };
  return specJson({ version: checkoutRolloutSpec.version, root: "root", elements });
}

/** Two hundred JSON items, pretty-printed. */
export function longJson(): string {
  return JSON.stringify({ items: Array.from({ length: 200 }, (_, index) => ({ id: index, name: `Item ${String(index)}`, tags: ["alpha", "beta"] })) }, null, 2);
}

/** Sixty Markdown sections. */
export function longMarkdown(): string {
  return Array.from({ length: 60 }, (_, index) => `## Section ${String(index + 1)}\n\nA paragraph that runs long enough to wrap across a line or two in the reader, so the page is tall.\n`).join("\n");
}

/** Five hundred CSV rows, so the grid scrolls on its own. */
export function longCsv(): string {
  const rows = Array.from({ length: 500 }, (_, index) => `${String(index + 1)},Region ${String(index % 7)},${String((index * 37) % 1000)}`);
  return ["id,region,orders", ...rows].join("\n");
}

interface FixtureFields {
  id: string;
  kind: ArtifactKind;
  title: string;
  content: string;
  publicId?: string;
  updatedAt?: string;
}

/** A private artifact by the fixture viewer (`authorId: "fixture"`), for layout tests without a database. */
export function fixtureArtifact({ id, kind, title, content, publicId = "fixture00000000000000a", updatedAt = "2026-11-07T12:00:00.000Z" }: FixtureFields): ArtifactDto {
  return {
    id,
    publicId,
    title,
    icon: null,
    theme: null,
    cover: null,
    fullWidth: false,
    summary: "A long artifact for layout tests.",
    content,
    kind,
    language: "",
    project: null,
    tags: [],
    sessionId: "",
    source: "web",
    visibility: "private",
    comments: "off",
    teamId: null,
    authorId: "fixture",
    originalAuthorId: null,
    pendingSharing: null,
    pendingEdit: null,
    pendingComments: null,
    files: [],
    updatedBy: null,
    metadata: {},
    createdAt: updatedAt,
    updatedAt,
  };
}
