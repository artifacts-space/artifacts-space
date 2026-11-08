"use client";

import { IconCheck, IconLoader2, IconX } from "@tabler/icons-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { projectLimits } from "@/lib/projects/limits";

interface InlineNameFormProps {
  /** The field's accessible name, such as "New project name". */
  label: string;
  initial?: string;
  submitLabel: string;
  /** Saves the name; resolves an error to show, or null when it saved. */
  onSubmit: (name: string) => Promise<string | null>;
  onCancel: () => void;
  /** Extra fields under the name, such as who the project is for. */
  children?: React.ReactNode;
}

/**
 * A one-line name form for the sidebar: create or rename a project. Escape
 * cancels. Errors show under the field, never as a browser bubble.
 */
export function InlineNameForm({ label, initial = "", submitLabel, onSubmit, onCancel, children }: InlineNameFormProps) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorId = useId();

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the project a name.");
      return;
    }
    setPending(true);
    const failure = await onSubmit(name).catch(() => "That did not save. Try again.");
    setPending(false);
    setError(failure);
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="px-1 py-1">
      <div className="flex items-center gap-0.5">
        <input
          autoFocus
          value={name}
          onChange={(event) => { setName(event.target.value); setError(null); }}
          onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          maxLength={projectLimits.maxNameChars}
          placeholder="Project name"
          className="h-7 min-w-0 flex-1 rounded-lg border bg-card px-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label={submitLabel} disabled={pending}>
          {pending ? <IconLoader2 className="animate-spin" /> : <IconCheck />}
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={onCancel}>
          <IconX />
        </Button>
      </div>
      {children}
      {error ? <p id={errorId} role="alert" className="mt-1 px-1 text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
