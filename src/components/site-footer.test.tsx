import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConsentNotice } from "@/components/legal-links";
import { legalContact, WEBRENEW_URL } from "@/lib/legal/contact";
import { PrivacyRights } from "@/components/legal/privacy-rights";
import { TermsConduct } from "@/components/legal/terms-conduct";

import { SiteFooter, siteFooterLinks } from "./site-footer";

describe("SiteFooter", () => {
  const html = renderToStaticMarkup(<SiteFooter />);

  it("should link to Support, the Privacy Policy, and the Terms when rendered", () => {
    expect(html).toContain('href="/support"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("should place Support beside Privacy and Terms when rendered", () => {
    const labels = siteFooterLinks.map((link) => link.label);
    expect(labels.slice(labels.indexOf("Support"))).toEqual(["Support", "Privacy", "Terms"]);
  });

  it("should credit Webrenew with a labelled link that opens safely in a new tab", () => {
    expect(html).toContain(`href="${WEBRENEW_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Webrenew (opens in a new tab)"');
    expect(html).toContain("© 2026 Webrenew LLC");
  });
});

describe("legal contact in the documents", () => {
  it("should link the privacy mailbox from the Privacy Policy", () => {
    expect(renderToStaticMarkup(<PrivacyRights />)).toContain(`mailto:${legalContact.privacyEmail}`);
  });

  it("should send copyright notices to the legal mailbox in the Terms", () => {
    expect(renderToStaticMarkup(<TermsConduct />)).toContain(`mailto:${legalContact.legalEmail}?subject=DMCA%20notice`);
  });
});

describe("ConsentNotice", () => {
  it("should link the Terms and the Privacy Policy under the sign-in forms", () => {
    const notice = renderToStaticMarkup(<ConsentNotice />);
    expect(notice).toContain("By continuing, you agree to the");
    expect(notice).toContain('href="/terms"');
    expect(notice).toContain('href="/privacy"');
  });
});
