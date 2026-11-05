"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSignUp && !name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    setPending(true);
    setError("");

    const result = isSignUp
      ? await authClient.signUp.email({ name, email, password, callbackURL: "/app" })
      : await authClient.signIn.email({ email, password, callbackURL: "/app" });

    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Try again.");
      setPending(false);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <div className="w-full max-w-[360px]">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-[-0.015em]">{isSignUp ? "Create your account" : "Sign in"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isSignUp ? "A workspace for your artifacts and the agents that use them." : "Continue to your workspace."}
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        {isSignUp && (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {isSignUp && <span className="text-xs text-muted-foreground">At least 8 characters</span>}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] leading-5 text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="h-10 w-full text-sm">
          {pending && <IconLoader2 className="animate-spin" />}
          {pending ? "One moment…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-muted-foreground">
        {isSignUp ? "Already have an account?" : "No account yet?"}{" "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
