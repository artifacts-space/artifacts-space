"use client";

import Link from "next/link";
import { IconBrandGithub, IconLoader2, IconMailCheck } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { flushSync } from "react-dom";

import { ErrorMessage, workspaceUrl } from "@/components/auth/auth-parts";
import { GoogleMark } from "@/components/auth/google-mark";
import { offersReviewerPassword, REVIEWER_PASSWORD_ID, ReviewerPasswordField } from "@/components/auth/reviewer-password-field";
import { ConsentNotice } from "@/components/legal-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { isDevSignInEnabled } from "@/lib/auth/dev-user";
import { signInErrorMessage } from "@/lib/auth/sign-in-error-rules";
import { genericError, validateEmail } from "@/lib/auth/sign-in-form-rules";
import { undeliverableAddressMessage } from "@/lib/auth/undeliverable-address";
import { safeNextPath, withNextPath } from "@/lib/safe-next";

type AuthMode = "sign-in" | "sign-up";
type SocialProvider = "github" | "google";
type Pending = SocialProvider | "email" | null;

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

/** Where GitHub or Google sends a refused sign-in: this page, keeping `?next=`. Better Auth adds `?error=`. */
function errorReturnUrl() {
  const next = new URLSearchParams(window.location.search).get("next");
  return new URL(withNextPath(window.location.pathname, next), window.location.origin).href;
}

const textButtonClass = "text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground";

/**
 * After a link was sent. For an address under a reviewer domain it also says
 * that a password account signs in with its password (such accounts get no
 * link); the domain alone decides, so it says nothing about who has one.
 */
function CheckEmail({ email, onBack, onUsePassword }: { email: string; onBack: () => void; onUsePassword: () => void }) {
  return (
    <div className="space-y-3">
      <IconMailCheck className="size-6 text-muted-foreground" />
      <h2 className="text-lg font-medium">Check your email</h2>
      <p className="text-md leading-6 text-muted-foreground">
        We sent a sign-in link to <span className="text-foreground">{email}</span>. Open it on this device to continue.
      </p>
      {offersReviewerPassword(email) ? (
        <p data-slot="password-instead" className="text-md leading-6 text-muted-foreground">
          If this account has a password, sign in with that instead.{" "}
          <button type="button" onClick={onUsePassword} className={textButtonClass}>Enter your password</button>
        </p>
      ) : null}
      <button type="button" onClick={onBack} className={textButtonClass}>
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

const switchLinkClass = "text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground";

/** The link to the other auth page, keeping the post-auth destination from `?next=`. */
function SwitchLinkWithNext({ href, label }: { href: string; label: string }) {
  const next = useSearchParams().get("next");
  return <Link href={withNextPath(href, next)} className={switchLinkClass}>{label}</Link>;
}

/** The switch link; the plain link stands in until the query string is read in the browser. */
function SwitchLink({ href, label }: { href: string; label: string }) {
  return (
    <Suspense fallback={<Link href={href} className={switchLinkClass}>{label}</Link>}>
      <SwitchLinkWithNext href={href} label={label} />
    </Suspense>
  );
}

/** Arriving from an invitation link: the invitation joins only the address it was sent to. */
function InvitationHintFromQuery() {
  const next = safeNextPath(useSearchParams().get("next"));
  if (!next?.startsWith("/invitations/")) return null;
  return (
    <p data-slot="invitation-hint" className="mt-3 text-md leading-6 text-foreground">
      Use the email address your invitation went to. You come back to the invitation after you sign in.
    </p>
  );
}

/** The invitation hint; nothing shows until the query string is read in the browser. */
function InvitationHint() {
  return (
    <Suspense fallback={null}>
      <InvitationHintFromQuery />
    </Suspense>
  );
}

/** Why GitHub or Google sent the person back here (`?error=`), in the page's own words. */
function ProviderErrorFromQuery() {
  const message = signInErrorMessage(useSearchParams().get("error"));
  return message ? <ErrorMessage message={message} className="mb-4" /> : null;
}

/** The provider error; nothing shows until the query string is read in the browser. */
function ProviderError() {
  return (
    <Suspense fallback={null}>
      <ProviderErrorFromQuery />
    </Suspense>
  );
}

function SocialButton({ provider, pending, onClick }: { provider: SocialProvider; pending: Pending; onClick: (provider: SocialProvider) => void }) {
  const icon = provider === "github" ? <IconBrandGithub /> : <GoogleMark />;
  return (
    <Button type="button" variant="outline" onClick={() => { onClick(provider); }} disabled={pending !== null} className="h-10 w-full text-sm">
      {pending === provider ? <IconLoader2 className="animate-spin" /> : icon}
      Continue with {provider === "github" ? "GitHub" : "Google"}
    </Button>
  );
}

/**
 * Sign in or sign up with GitHub, Google, or an emailed magic link. Google
 * shows only when the page says it is configured (`isGoogleSignInEnabled`),
 * so a deploy without it never offers a button that cannot work.
 */
export function AuthForm({ mode, googleEnabled }: { mode: AuthMode; googleEnabled: boolean }) {
  const text = copy[mode];
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending>(null);

  async function continueWith(provider: SocialProvider) {
    setPending(provider);
    setError("");
    try {
      const { error: failure } = await authClient.signIn.social({ provider, callbackURL: workspaceUrl(), errorCallbackURL: errorReturnUrl() });
      if (failure) setError(failure.message ?? genericError);
    } catch {
      setError(genericError);
    } finally {
      setPending(null);
    }
  }

  const startSocial = (provider: SocialProvider) => void continueWith(provider);

  async function sendLink(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
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
        const undeliverable = undeliverableAddressMessage(failure.code, email.trim());
        setError(undeliverable ?? failure.message ?? genericError);
        if (undeliverable) form.querySelector<HTMLInputElement>("input[name=email]")?.focus();
        return;
      }
      setSentTo(email.trim());
    } catch {
      setError(genericError);
    } finally {
      setPending(null);
    }
  }

  /** Back to the form with the same address, and the cursor in the password field. */
  function returnToPassword() {
    flushSync(() => { setSentTo(""); });
    document.getElementById(REVIEWER_PASSWORD_ID)?.focus();
  }

  if (sentTo) return <div className="w-full max-w-[360px]"><CheckEmail email={sentTo} onBack={() => { setSentTo(""); }} onUsePassword={returnToPassword} /></div>;

  const passwordIsPrimary = mode === "sign-in" && offersReviewerPassword(email);

  return (
    <div className="w-full max-w-[360px]">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-[-0.015em]">{text.title}</h1>
        <p className="mt-2 text-md leading-6 text-muted-foreground">{text.description}</p>
        <InvitationHint />
      </div>

      {error || pending ? null : <ProviderError />}
      <div className="space-y-3">
        <SocialButton provider="github" pending={pending} onClick={startSocial} />
        {googleEnabled ? <SocialButton provider="google" pending={pending} onClick={startSocial} /> : null}
      </div>
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
        {mode === "sign-in" ? <ReviewerPasswordField email={email} /> : null}
        <ErrorMessage message={error} />
        <Button type="submit" variant={passwordIsPrimary ? "outline" : "default"} disabled={pending !== null} className="h-10 w-full text-sm">
          {pending === "email" ? <IconLoader2 className="animate-spin" /> : null}
          Email me a sign-in link
        </Button>
      </form>
      <ConsentNotice className="mt-4" />

      <p className="mt-6 text-sm text-muted-foreground">
        {text.switchPrompt}{" "}
        <SwitchLink href={text.switchHref} label={text.switchLabel} />
      </p>
    </div>
  );
}
