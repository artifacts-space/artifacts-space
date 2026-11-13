import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { legalDates } from "@/lib/legal/contact";
import type { LegalDocument } from "@/lib/legal/headings";

import { LegalPage } from "./legal-page";

function render(doc: LegalDocument): string {
  return renderToStaticMarkup(
    <LegalPage doc={doc} title="Title" lead="Lead" summary={[]}>
      <p>Body</p>
    </LegalPage>,
  );
}

describe("LegalPage dates", () => {
  it("should show each document's own last-updated date when that document renders", () => {
    for (const doc of ["privacy", "terms"] as const) {
      const updated = legalDates.updated[doc];
      expect(render(doc)).toContain(`Last updated <time dateTime="${updated.iso}">${updated.label}</time>`);
    }
  });

  it("should not show the other document's date when only one document changed", () => {
    const { privacy, terms } = legalDates.updated;
    if (privacy.iso === terms.iso) return;
    expect(render("privacy")).not.toContain(terms.label);
    expect(render("terms")).not.toContain(privacy.label);
  });
});
