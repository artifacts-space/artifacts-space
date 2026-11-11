import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Sign-in fixture",
  robots: { index: false, follow: false },
};

/**
 * Development-only page for the sign-in e2e test: the real sign-in form,
 * with Google shown (`?google=1`) or hidden, as `?mode=sign-up` or sign-in,
 * without Google credentials. Returns 404 in every other environment.
 */
export default async function SignInFixturePage({ searchParams }: PageProps<"/dev/sign-in">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  return (
    <AuthShell>
      <AuthForm mode={params.mode === "sign-up" ? "sign-up" : "sign-in"} googleEnabled={params.google === "1"} />
    </AuthShell>
  );
}
