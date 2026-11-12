"use client";

import { useState } from "react";

import { workspaceUrl } from "@/components/auth/auth-parts";
import { authClient } from "@/lib/auth/client";
import { genericError, passwordFailureMessage, passwordFormProblem } from "@/lib/auth/sign-in-form-rules";

/**
 * Signs in with an email and a password (accounts the owner gave one), for
 * the reviewer page and the password field on the sign-in page. On success
 * it loads the page sign-in was started for (`?next=`), which can be the
 * OAuth server's authorize URL, so an app's connection continues.
 */
export function usePasswordSignIn() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(email: string, password: string) {
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
      window.location.assign(workspaceUrl());
    } catch {
      setError(genericError);
      setPending(false);
    }
  }

  return { error, pending, submit: (email: string, password: string) => void submit(email, password) };
}
