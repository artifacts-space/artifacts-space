import type { DocsHeading } from "@/lib/docs/pages";

/**
 * The sections of the Privacy Policy and the Terms. The table of contents and
 * each anchored heading read from here, so they always agree.
 */

export type LegalDocument = "privacy" | "terms";

const h2 = (id: string, title: string): DocsHeading => ({ id, title, level: 2 });
const h3 = (id: string, title: string): DocsHeading => ({ id, title, level: 3 });

export const legalHeadings = {
  privacy: [
    h2("who-we-are", "Who we are"),
    h2("what-we-collect", "What we collect"),
    h3("account", "Account information"),
    h3("content", "Content you and your agents create"),
    h3("agent-activity", "Agent and app activity"),
    h3("technical", "Technical data and logs"),
    h3("cookies", "Cookies and local storage"),
    h2("how-we-use", "How we use it"),
    h2("legal-bases", "Legal bases (EEA and UK)"),
    h2("visibility", "What other people can see"),
    h2("connected-apps", "Agents and apps you connect"),
    h2("providers", "Service providers"),
    h2("no-sale", "No selling, no ad sharing"),
    h2("retention", "How long we keep data"),
    h2("security", "Security"),
    h2("transfers", "International transfers"),
    h2("your-rights", "Your rights and choices"),
    h3("self-service", "What you can do yourself"),
    h3("rights-eea", "EEA and UK"),
    h3("rights-us", "US state privacy laws"),
    h3("requests", "How to make a request"),
    h3("appeals", "Appeals"),
    h2("children", "Children"),
    h2("changes", "Changes to this policy"),
    h2("contact", "Contact us"),
  ],
  terms: [
    h2("agreement", "These terms"),
    h2("eligibility", "Who can use artifacts.space"),
    h2("accounts", "Your account"),
    h2("teams", "Teams"),
    h2("your-content", "Your content"),
    h2("agents", "AI agents and connected apps"),
    h2("acceptable-use", "Acceptable use"),
    h2("reports", "Reports and enforcement"),
    h2("copyright", "Copyright and DMCA"),
    h3("dmca-notice", "Sending a notice"),
    h3("dmca-counter", "Sending a counter-notice"),
    h3("repeat-infringers", "Repeat infringers"),
    h2("fees", "Fees"),
    h2("availability", "Availability and changes"),
    h2("termination", "Ending your use"),
    h2("disclaimers", "Disclaimers"),
    h2("liability", "Limitation of liability"),
    h2("indemnity", "Indemnity"),
    h2("governing-law", "Governing law and venue"),
    h2("general", "General terms"),
    h2("changes", "Changes to these terms"),
    h2("contact", "Contact and notices"),
  ],
} as const satisfies Record<LegalDocument, readonly DocsHeading[]>;

/** One section heading of a document. Throws for an id that is not listed, so a typo fails the build. */
export function legalHeading(document: LegalDocument, id: string): DocsHeading {
  const heading = legalHeadings[document].find((item) => item.id === id);
  if (!heading) throw new Error(`No "${id}" heading in the ${document} document. Add it to src/lib/legal/headings.ts.`);
  return heading;
}

/** The top-level sections only, for the compact table of contents on phones. */
export function legalSections(document: LegalDocument): DocsHeading[] {
  return legalHeadings[document].filter((heading) => heading.level === 2);
}
