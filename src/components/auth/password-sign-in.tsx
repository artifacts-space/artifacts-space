"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useId, useState } from "react";

import { ErrorMessage, workspaceUrl } from "@/components/auth/auth-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { genericError, passwordFailureMessage, passwordFormProblem } from "@/lib/auth/sign-in-form-rules";

function PasswordForm({ formId }: { formId: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signIn(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = passwordFormProblem(email, password);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError("");
    try {
      const { error: failure } = await authClient.signIn.email({ email: email.trim(), password });
      if (failure) {
        setError(passwordFailureMessage(failure));
        setPending(false);
        return;
      }
      // A full page load: `next` can be the OAuth server's authorize URL, which continues an app's connection.
      window.location.assign(workspaceUrl());
    } catch {
      setError(genericError);
      setPending(false);
    }
  }

  return (
    <form id={formId} aria-label="Sign in with a password" onSubmit={(event) => void signIn(event)} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${formId}-email`}>Email</Label>
        <Input id={`${formId}-email`} name="email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(event) => { setEmail(event.target.value); }} className="h-10" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-password`}>Password</Label>
        <Input id={`${formId}-password`} name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => { setPassword(event.target.value); }} className="h-10" />
      </div>
      <ErrorMessage message={error} />
      <Button type="submit" variant="outline" disabled={pending} className="h-10 w-full text-sm">
        {pending ? <IconLoader2 className="animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}

/**
 * A quiet way in for accounts the owner gave a password (connector directory
 * reviewers; password-sign-in-rules.ts). A small link below every other
 * option opens the form in a dialog, so it never moves the main options or
 * reads as the usual way in. There is no sign-up and no reset here: a
 * password comes only from the owner.
 */
export function PasswordSignIn() {
  const formId = useId();
  return (
    <div className="mt-6 border-t border-border pt-4">
      <Dialog>
        <DialogTrigger className="text-sm text-muted-foreground underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground">
          Sign in with a password
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">Sign in with a password</DialogTitle>
            <DialogDescription>For accounts we set up with a password.</DialogDescription>
          </DialogHeader>
          <PasswordForm formId={formId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
