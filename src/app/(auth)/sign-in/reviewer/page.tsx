import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ReviewerSignInForm } from "@/components/auth/reviewer-sign-in-form";

/**
 * The unlisted sign-in page for accounts the owner gave a password (connector
 * directory reviewers, password-sign-in-rules.ts). Nothing links here: the
 * owner gives the URL to each directory. Never indexed, never in the sitemap.
 */
export const metadata: Metadata = {
  title: "Sign in with a password",
  robots: { index: false, follow: false },
};

export default function ReviewerSignInPage() {
  return (
    <AuthShell>
      <ReviewerSignInForm />
    </AuthShell>
  );
}
