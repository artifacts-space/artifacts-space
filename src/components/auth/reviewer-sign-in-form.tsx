"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";

import { ErrorMessage } from "@/components/auth/auth-parts";
import { usePasswordSignIn } from "@/components/auth/use-password-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The form on the unlisted reviewer page (/sign-in/reviewer): an email and a
 * password, for accounts the owner gave a password. It keeps `?next=`, so a
 * pending app connection continues after sign-in, as on the sign-in page.
 */
export function ReviewerSignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { error, pending, submit } = usePasswordSignIn();

  return (
    <div className="w-full max-w-[360px]">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-[-0.015em]">Sign in with a password</h1>
        <p className="mt-2 text-md leading-6 text-muted-foreground">Use the email and password we gave you.</p>
      </div>
      <form
        aria-label="Sign in with a password"
        onSubmit={(event) => {
          event.preventDefault();
          submit(email, password);
        }}
        noValidate
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="reviewer-email">Email</Label>
          <Input id="reviewer-email" name="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(event) => { setEmail(event.target.value); }} className="h-10" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reviewer-page-password">Password</Label>
          <Input id="reviewer-page-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); }} className="h-10" />
        </div>
        <ErrorMessage message={error} />
        <Button type="submit" disabled={pending} className="h-10 w-full text-sm">
          {pending ? <IconLoader2 className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </div>
  );
}
