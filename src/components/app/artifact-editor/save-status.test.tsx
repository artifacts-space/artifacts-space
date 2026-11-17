import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COPY_LINK_LABEL } from "@/components/copy-button";

import { SaveStatusBar } from "./save-status";

const noop = () => undefined;
const internalId = "c4537d4c-1a2b-4c3d-8e9f-0123456789ab";
const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const url = `https://artifacts.example/artifact/${publicId}`;

/** The meta line of a saved artifact, as the server draws it. */
function metaLine(link: { publicId: string; url: string } | undefined) {
  return renderToStaticMarkup(
    <SaveStatusBar status={{ kind: "idle" }} dirty={false} length={889} updatedAt="2026-11-17T12:00:00.000Z" updatedBy={null} link={link} onRetry={noop} />,
  );
}

describe("SaveStatusBar's link", () => {
  it("should show the start of the id the link carries, with a button named Copy link", () => {
    const html = metaLine({ publicId, url });
    expect(html).toContain('<span class="font-mono">4fXkP9qR</span>');
    expect(COPY_LINK_LABEL).toBe("Copy link");
    expect(html).toContain('aria-label="Copy link"');
    expect(html).toContain('title="Copy link"');
  });

  it("should never show the artifact's internal id or call what it copies an id", () => {
    const html = metaLine({ publicId, url });
    expect(html).not.toContain(internalId.slice(0, 8));
    expect(html).not.toMatch(/artifact id|Copy the id/i);
  });

  it("should show no link for a new artifact that is not stored yet", () => {
    const html = metaLine(undefined);
    expect(html).not.toContain("Copy link");
    expect(html).not.toContain('data-slot="artifact-link"');
  });
});
