"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";

import { ErrorMessage } from "@/components/auth/auth-parts";
import { usePasswordSignIn } from "@/components/auth/use-password-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isReviewerDomainEmail, testDomainAllowedInThisBuild } from "@/lib/auth/reviewer-domains";

/** The password input's id, so the check-email screen can bring the person back to it. */
export const REVIEWER_PASSWORD_ID = "reviewer-password";

/** True when the sign-in page offers a password for this typed address: the domain alone decides, never an account lookup. */
export function offersReviewerPassword(email: string): boolean {
  return isReviewerDomainEmail(email, testDomainAllowedInThisBuild);
}

/**
 * A password field on the sign-in page, shown only once the typed address is
 * under a reviewer domain (reviewer-domains.ts): decided from the typed text
 * alone, in the browser, with no request, so it reveals nothing about who
 * has an account. For everyone else it renders nothing, so nothing moves.
 * While it shows, "Sign in" with the password is the primary action and the
 * emailed link below it the secondary one. It lives inside the sign-in link
 * form, so Enter in the password field signs in with the password and Enter
 * in the email field still sends a link.
 */
export function ReviewerPasswordField({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const { error, pending, submit } = usePasswordSignIn();
  if (!offersReviewerPassword(email)) return null;

  return (
    <div data-slot="reviewer-password" className="space-y-2">
      <Label htmlFor={REVIEWER_PASSWORD_ID}>Password</Label>
      <Input
        id={REVIEWER_PASSWORD_ID}
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => { setPassword(event.target.value); }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          // Always keep Enter from submitting the link form; while a sign-in is pending, send nothing more.
          event.preventDefault();
          if (pending) return;
          submit(email, password);
        }}
        className="h-10"
      />
      <p className="text-xs leading-5 text-muted-foreground">Have a password from us? Sign in with it. Otherwise, use the emailed link.</p>
      <ErrorMessage message={error} />
      <Button type="button" disabled={pending} onClick={() => { submit(email, password); }} className="h-10 w-full text-sm">
        {pending ? <IconLoader2 className="animate-spin" /> : null}
        Sign in
      </Button>
    </div>
  );
}
