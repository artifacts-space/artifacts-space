import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { botCheckRuns } from "@/lib/abuse/bot-check-rules";
import { isGoogleSignInEnabled } from "@/lib/auth/google-sign-in-rules";
import { socialAuthEnv } from "@/lib/auth/social-auth-options";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell>
      <AuthForm mode="sign-up" googleEnabled={isGoogleSignInEnabled(socialAuthEnv())} botCheck={botCheckRuns({ VERCEL_ENV: process.env.VERCEL_ENV })} />
    </AuthShell>
  );
}
