"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";

import { ErrorMessage } from "@/components/auth/auth-parts";
import { usePasswordSignIn } from "@/components/auth/use-password-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isReviewerDomainEmail, testDomainAllowedInThisBuild } from "@/lib/auth/reviewer-domains";

/**
 * A password field on the sign-in page, shown only once the typed address is
 * under a reviewer domain (reviewer-domains.ts): decided from the typed text
 * alone, in the browser, with no request, so it reveals nothing about who
 * has an account. For everyone else it renders nothing, so nothing moves.
 * The emailed link stays below it for every other address on that domain.
 * It lives inside the sign-in link form, so Enter in the password field
 * signs in with the password and Enter in the email field still sends a link.
 */
export function ReviewerPasswordField({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const { error, pending, submit } = usePasswordSignIn();
  if (!isReviewerDomainEmail(email, testDomainAllowedInThisBuild)) return null;

  return (
    <div data-slot="reviewer-password" className="space-y-2">
      <Label htmlFor="reviewer-password">Password</Label>
      <Input
        id="reviewer-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => { setPassword(event.target.value); }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          submit(email, password);
        }}
        className="h-10"
      />
      <p className="text-xs leading-5 text-muted-foreground">Have a password from us? Sign in with it. Otherwise, use the emailed link.</p>
      <ErrorMessage message={error} />
      <Button type="button" variant="outline" disabled={pending} onClick={() => { submit(email, password); }} className="h-10 w-full text-sm">
        {pending ? <IconLoader2 className="animate-spin" /> : null}
        Sign in with password
      </Button>
    </div>
  );
}
