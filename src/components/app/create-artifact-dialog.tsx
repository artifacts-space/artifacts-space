"use client";

import { IconLoader2 } from "@tabler/icons-react";
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
import { kinds } from "@/lib/artifact-kinds";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";

/** Reads a text field from form data. File inputs and missing fields read as empty. */
function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

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

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    try {
      const result = await createArtifactAction({
        title: formText(formData, "title"),
        summary: formText(formData, "summary"),
        project: formText(formData, "project"),
        language: formText(formData, "language"),
        content: formText(formData, "content"),
        kind,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onCreated(result.data);
      onOpenChange(false);
      form.reset();
      setKind("markdown");
      toast.success("Artifact created.");
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto overscroll-contain p-0 sm:max-w-2xl">
        <form onSubmit={(event) => void submit(event)} noValidate>
          <DialogHeader className="border-b p-6">
            <DialogTitle className="text-lg">New artifact</DialogTitle>
            <DialogDescription>
              Agents find artifacts by title, summary, and project. Content can be markdown, code, text, or JSON.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-title">Title</Label>
                <Input id="artifact-title" name="title" required maxLength={160} autoFocus placeholder="Authentication architecture decision" className="h-9" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artifact-project">Project</Label>
                <Input id="artifact-project" name="project" maxLength={120} placeholder="artifacts-space" className="h-9" />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={kind} onValueChange={(value) => { if (value) setKind(value); }}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-summary">Summary <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="artifact-summary" name="summary" maxLength={600} placeholder="One line, used for search and agent retrieval" className="h-9" />
              </div>
              {kind === "code" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="artifact-language">Language</Label>
                  <Input id="artifact-language" name="language" maxLength={60} placeholder="typescript" className="h-9" />
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-content">Content</Label>
                <Textarea
                  id="artifact-content"
                  name="content"
                  required
                  placeholder="## Decision"
                  className="min-h-56 resize-y p-4 font-mono text-xs leading-6"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="m-0 rounded-none border-t bg-muted/40 px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => { onOpenChange(false); }}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <IconLoader2 className="animate-spin" />}
              {pending ? "Creating…" : "Create artifact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
