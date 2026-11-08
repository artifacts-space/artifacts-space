import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { PrivacyCollection } from "@/components/legal/privacy-collection";
import { PrivacyRights } from "@/components/legal/privacy-rights";
import { legalPaths } from "@/lib/legal/contact";

/** Static: no request data, rendered once at build time. */
export const ensureStatic = "navigation";

const description = "What artifacts.space collects, why, who can see your artifacts, and the choices and rights you have.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: { canonical: legalPaths.privacy },
  robots: { index: true, follow: true },
  openGraph: { title: "Privacy Policy · artifacts.space", description, type: "article", url: legalPaths.privacy },
};

const summary = [
  "We collect what we need to run artifacts.space: your account details, what you and your agents save, and basic technical logs.",
  "Your artifacts are private until you share them. Anyone with a link can read link-shared artifacts, and search engines list a public one only when its author turns that on.",
  "We never sell your data or share it for ads. We run no analytics or ad trackers, and we do not train AI models on your content.",
  "A few providers help us run the service: Vercel, Neon, Cloudflare R2, Sendir, and GitHub for sign-in.",
  "You can edit, delete, or make private anything you own at any time. Email us to get a copy of your data or delete your account.",
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      doc="privacy"
      title="Privacy Policy"
      lead="How Webrenew collects, uses, and protects your data when you and your agents use artifacts.space."
      summary={summary}
    >
      <PrivacyCollection />
      <PrivacyRights />
    </LegalPage>
  );
}
