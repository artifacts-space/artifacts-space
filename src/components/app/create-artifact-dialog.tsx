"use client";

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { createArtifactAction } from "@/app/(workspace)/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";

export function CreateArtifactDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (artifact: ArtifactDto) => void;
}) {
  const [pending, setPending] = useState(false);
  const [kind, setKind] = useState<ArtifactKind>("markdown");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);

    const result = await createArtifactAction({
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      project: String(formData.get("project") ?? ""),
      language: String(formData.get("language") ?? ""),
      content: String(formData.get("content") ?? ""),
      kind,
    });

    setPending(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }

    onCreated(result.data);
    onOpenChange(false);
    form.reset();
    setKind("markdown");
    toast.success("Artifact created.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto overscroll-contain border-white/10 bg-[#17181d] p-0 sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-white/10 p-6">
            <div className="mb-1 font-mono text-[9px] tracking-[0.14em] text-[#72a5ff]">NEW ARTIFACT</div>
            <DialogTitle className="text-xl tracking-[-0.025em]">Keep something worth coming back to.</DialogTitle>
            <DialogDescription className="text-white/40">
              Capture a decision, plan, code snippet, or research note for your next session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-title">Title</Label>
                <Input id="artifact-title" name="title" required maxLength={160} autoFocus placeholder="Authentication architecture decision" className="h-10 border-white/10 bg-white/[0.03]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artifact-project">Project</Label>
                <Input id="artifact-project" name="project" maxLength={120} placeholder="artifacts-space" className="h-10 border-white/10 bg-white/[0.03]" />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as ArtifactKind)}>
                  <SelectTrigger className="h-10 w-full border-white/10 bg-white/[0.03]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#1b1c22]">
                    {["markdown", "code", "text", "json"].map((value) => (
                      <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-summary">Summary <span className="font-normal text-white/25">(optional)</span></Label>
                <Input id="artifact-summary" name="summary" maxLength={600} placeholder="The short version, for search and agent retrieval" className="h-10 border-white/10 bg-white/[0.03]" />
              </div>
              {kind === "code" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="artifact-language">Language</Label>
                  <Input id="artifact-language" name="language" maxLength={60} placeholder="typescript" className="h-10 border-white/10 bg-white/[0.03]" />
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-content">Content</Label>
                <Textarea
                  id="artifact-content"
                  name="content"
                  required
                  placeholder="## Decision\n\nWhat did you learn, decide, or build?"
                  className="min-h-56 resize-y border-white/10 bg-[#101115] p-4 font-mono text-xs leading-6"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="m-0 rounded-none border-white/10 bg-white/[0.015] p-4 px-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending} className="bg-[#1768ff] text-white hover:bg-[#2f76ff]">
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              {pending ? "Creating…" : "Create artifact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
