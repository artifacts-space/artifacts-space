"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { chooseUsernameAction } from "@/app/(workspace)/onboarding-actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cleanHandleInput, validateHandle } from "@/lib/handles";

/** One step on first visit: keep the suggested username or pick another. */
export function UsernameOnboarding({ suggestion }: { suggestion: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestion);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = cleanHandleInput(username);
    const problem = validateHandle(cleaned);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await chooseUsernameAction(cleaned);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell>
      <div className="w-full max-w-[360px]">
        <h1 className="text-2xl font-medium tracking-[-0.015em]">Choose your username</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          People and agents use it to find you in teams. It is also the name of your personal team. You choose it once.
        </p>
        <form onSubmit={(event) => void submit(event)} noValidate className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => { setUsername(event.target.value); setError(""); }}
              aria-invalid={error ? true : undefined}
              aria-describedby="username-help"
              className="h-10 font-mono"
            />
            <p id="username-help" className="text-xs leading-5 text-muted-foreground">Lowercase letters, numbers, and hyphens.</p>
          </div>
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] leading-5 text-destructive">{error}</p>
          ) : null}
          <Button type="submit" disabled={pending} className="h-10 w-full text-sm">
            {pending ? <IconLoader2 className="animate-spin" /> : null}
            Continue
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
