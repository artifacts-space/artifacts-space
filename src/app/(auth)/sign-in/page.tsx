import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { isGoogleSignInEnabled } from "@/lib/auth/google-sign-in-rules";
import { socialAuthEnv } from "@/lib/auth/social-auth-options";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell>
      <AuthForm mode="sign-in" googleEnabled={isGoogleSignInEnabled(socialAuthEnv())} />
    </AuthShell>
  );
}
