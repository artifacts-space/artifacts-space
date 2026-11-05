"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
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
    setPending(true);
    setError("");

    const result = isSignUp
      ? await authClient.signUp.email({ name, email, password, callbackURL: "/app" })
      : await authClient.signIn.email({ email, password, callbackURL: "/app" });

    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Please try again.");
      setPending(false);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <div className="w-full max-w-[390px]">
      <div className="mb-8">
        <div className="mb-4 font-mono text-[10px] tracking-[0.16em] text-[#72a5ff]">
          {isSignUp ? "CREATE YOUR WORKSPACE" : "WELCOME BACK"}
        </div>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">
          {isSignUp ? "Give your agents a memory." : "Continue the work."}
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/45">
          {isSignUp
            ? "One place for the context every coding session should keep."
            : "Your artifacts are right where you left them."}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {isSignUp && (
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs text-white/60">Name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Ada Lovelace"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 border-white/10 bg-white/[0.035] px-3.5 text-sm placeholder:text-white/20"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs text-white/60">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 border-white/10 bg-white/[0.035] px-3.5 text-sm placeholder:text-white/20"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs text-white/60">Password</Label>
            {!isSignUp && <span className="font-mono text-[9px] text-white/25">8+ CHARACTERS</span>}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder="••••••••••••"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 border-white/10 bg-white/[0.035] px-3.5 text-sm placeholder:text-white/20"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-xs leading-5 text-red-200">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="h-11 w-full bg-[#ecece9] text-black hover:bg-white">
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          {pending ? "Opening workspace…" : isSignUp ? "Create workspace" : "Sign in"}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-white/35">
        {isSignUp ? "Already have an account?" : "New to artifacts.space?"}{" "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="text-white/70 underline decoration-white/20 underline-offset-4 hover:text-white">
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
      <p className="mt-10 text-center font-mono text-[9px] leading-5 tracking-[0.06em] text-white/20">
        PRIVATE BY DEFAULT · REVOCABLE AGENT ACCESS
      </p>
    </div>
  );
}
