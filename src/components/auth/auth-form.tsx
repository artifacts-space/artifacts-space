"use client";

import Link from "next/link";
import { IconBrandGithub, IconLoader2, IconMailCheck } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { isDevSignInEnabled } from "@/lib/auth/dev-user";

type AuthMode = "sign-in" | "sign-up";
type Pending = "github" | "email" | null;

const copy = {
  "sign-up": {
    title: "Create your account",
    description: "A workspace for your artifacts and the agents that use them.",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/sign-in",
  },
  "sign-in": {
    title: "Sign in",
    description: "Continue to your workspace.",
    switchPrompt: "No account yet?",
    switchLabel: "Create one",
    switchHref: "/sign-up",
  },
} as const;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const genericError = "Something went wrong. Check your connection and try again.";

/** Returns a problem with the email address, or null when it can be sent. */
export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Enter your email address.";
  if (!emailPattern.test(email.trim())) return "Enter a valid email address.";
  return null;
}

/** Where to land after sign-in, as an absolute URL on this site. */
function workspaceUrl() {
  return new URL("/app", window.location.origin).href;
}

function CheckEmail({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="space-y-3">
      <IconMailCheck className="size-6 text-muted-foreground" />
      <h2 className="text-lg font-medium">Check your email</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        We sent a sign-in link to <span className="text-foreground">{email}</span>. Open it on this device to continue.
      </p>
      <button type="button" onClick={onBack} className="text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Use a different email
      </button>
    </div>
  );
}

/** Development only: one click signs in as the stub dev user. */
function DevSignIn() {
  if (!isDevSignInEnabled) return null;
  return (
    <a
      href="/api/dev/sign-in"
      className="mt-3 flex h-10 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground"
    >
      Continue as dev user
    </a>
  );
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] leading-5 text-destructive">
      {message}
    </p>
  );
}

/** Sign in or sign up with GitHub or an emailed magic link. */
export function AuthForm({ mode }: { mode: AuthMode }) {
  const text = copy[mode];
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending>(null);

  async function continueWithGitHub() {
    setPending("github");
    setError("");
    try {
      const { error: failure } = await authClient.signIn.social({ provider: "github", callbackURL: workspaceUrl() });
      if (failure) setError(failure.message ?? genericError);
    } catch {
      setError(genericError);
    } finally {
      setPending(null);
    }
  }

  async function sendLink(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    setPending("email");
    setError("");
    try {
      const { error: failure } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: workspaceUrl() });
      if (failure) {
        setError(failure.message ?? genericError);
        return;
      }
      setSentTo(email.trim());
    } catch {
      setError(genericError);
    } finally {
      setPending(null);
    }
  }

  if (sentTo) return <div className="w-full max-w-[360px]"><CheckEmail email={sentTo} onBack={() => { setSentTo(""); }} /></div>;

  return (
    <div className="w-full max-w-[360px]">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-[-0.015em]">{text.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text.description}</p>
      </div>

      <Button type="button" variant="outline" onClick={() => void continueWithGitHub()} disabled={pending !== null} className="h-10 w-full text-sm">
        {pending === "github" ? <IconLoader2 className="animate-spin" /> : <IconBrandGithub />}
        Continue with GitHub
      </Button>
      <DevSignIn />

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={(event) => void sendLink(event)} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); }} className="h-10" />
        </div>
        <ErrorMessage message={error} />
        <Button type="submit" disabled={pending !== null} className="h-10 w-full text-sm">
          {pending === "email" ? <IconLoader2 className="animate-spin" /> : null}
          Email me a sign-in link
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-muted-foreground">
        {text.switchPrompt}{" "}
        <Link href={text.switchHref} className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">
          {text.switchLabel}
        </Link>
      </p>
    </div>
  );
}
