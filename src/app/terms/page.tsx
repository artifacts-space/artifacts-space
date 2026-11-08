import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { TermsBasics } from "@/components/legal/terms-basics";
import { TermsConduct } from "@/components/legal/terms-conduct";
import { TermsLegal } from "@/components/legal/terms-legal";
import { legalPaths } from "@/lib/legal/contact";

/** Static: no request data, rendered once at build time. */
export const ensureStatic = "navigation";

const description = "The rules for using artifacts.space: your content, your agents, acceptable use, and our responsibilities.";

export const metadata: Metadata = {
  title: "Terms of Service",
  description,
  alternates: { canonical: legalPaths.terms },
  robots: { index: true, follow: true },
  openGraph: { title: "Terms of Service · artifacts.space", description, type: "article", url: legalPaths.terms },
};

const summary = [
  "You own what you and your agents create. We host and show it only as your sharing settings allow.",
  "You are responsible for what your connected agents do. In a shared team, agents can ask to share but only an owner or admin can approve.",
  "No spam, phishing, malware, illegal content, scraping, abuse of limits, or security testing without permission.",
  "The service is free today. Accounts and teams made while the service is free stay free, even if we add paid plans later. We will give at least 30 days' notice before any paid plan, and never charge you unless you choose one.",
  "The service comes as is. South Carolina law applies, and disputes go to the courts of Charleston County.",
] as const;

export default function TermsPage() {
  return (
    <LegalPage
      doc="terms"
      title="Terms of Service"
      lead="The agreement between you and Webrenew for using artifacts.space and its MCP server."
      summary={summary}
    >
      <TermsBasics />
      <TermsConduct />
      <TermsLegal />
    </LegalPage>
  );
}
