"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createTeamAction } from "@/app/(workspace)/teams/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cleanHandleInput, toHandle, validateHandle } from "@/lib/handles";

import { FormError } from "./form-error";
import { SharingRulePicker } from "./sharing-rule-picker";

/** Returns the first problem with the form, or "" when it can be sent. */
function formProblem(name: string, slug: string) {
  if (!name.trim()) return "Give the team a name.";
  return validateHandle(cleanHandleInput(slug)) ?? "";
}

/** Name, URL, and sharing rule for a new team. */
export function CreateTeamForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function changeName(value: string) {
    setName(value);
    setError("");
    if (!slugEdited) setSlug(toHandle(value));
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = formProblem(name, slug);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    try {
      const result = await createTeamAction({ name, slug, teamSharingNeedsApproval: needsApproval });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Team created.");
      router.push(`/teams/${result.data.slug}`);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="team-name">Name</Label>
        <Input id="team-name" value={name} onChange={(event) => { changeName(event.target.value); }} maxLength={80} autoFocus placeholder="Platform team" className="h-9" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="team-slug">Team URL</Label>
        <div className="flex items-center rounded-md border bg-background pl-3 focus-within:ring-2 focus-within:ring-ring/50">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">/teams/</span>
          <input
            id="team-slug"
            value={slug}
            onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); setError(""); }}
            autoCapitalize="none"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 bg-transparent pr-3 font-mono text-[13px] outline-none"
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Lowercase letters, numbers, and hyphens. It cannot change later.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Sharing with the team</legend>
        <SharingRulePicker value={needsApproval} onChange={setNeedsApproval} />
        <p className="text-xs leading-5 text-muted-foreground">
          Link and public sharing always need an admin&apos;s approval in a team. Owners can change this rule later.
        </p>
      </fieldset>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <IconLoader2 className="animate-spin" /> : null}
          {pending ? "Creating…" : "Create team"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => { router.push("/teams"); }}>Cancel</Button>
      </div>
    </form>
  );
}
