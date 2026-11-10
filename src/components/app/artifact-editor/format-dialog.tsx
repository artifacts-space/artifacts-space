"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";

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
import { formatInfo } from "@/lib/artifact-formats";
import { kinds } from "@/lib/artifact-kinds";
import type { ArtifactKind } from "@/lib/artifact-types";

import { formatSwitchProblem } from "./format-choice-rules";

interface FormatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ArtifactKind;
  language: string;
  content: string;
  /** Saves the choice through the editor's draft, so it goes out with the next autosave. */
  onApply: (kind: ArtifactKind, language: string) => void;
}

/** The form inside the dialog. Mounted per opening, so it starts from the artifact's current format. */
function FormatForm({ kind, language, content, onApply, onClose }: Omit<FormatDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [nextKind, setNextKind] = useState<ArtifactKind>(kind);
  const [nextLanguage, setNextLanguage] = useState(language);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const refused = nextKind === kind ? null : formatSwitchProblem(nextKind, content);
    if (refused) {
      setProblem(refused);
      return;
    }
    onApply(nextKind, nextLanguage.trim());
    onClose();
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Format and language</DialogTitle>
        <DialogDescription>Pick how this artifact shows its content. The content stays as it is.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label id="format-choice-label">Format</Label>
        <Select value={nextKind} onValueChange={(value) => { if (value) { setNextKind(value); setProblem(null); } }}>
          <SelectTrigger aria-labelledby="format-choice-label" aria-describedby="format-choice-help" className="h-9 w-full">
            <SelectValue>{(value: ArtifactKind) => formatInfo[value].label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {kinds.map((value) => <SelectItem key={value} value={value}>{formatInfo[value].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p id="format-choice-help" className="text-sm leading-5 text-muted-foreground">{formatInfo[nextKind].helper}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="format-choice-language">Language <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="format-choice-language" value={nextLanguage} maxLength={60} onChange={(event) => { setNextLanguage(event.target.value); }} placeholder="typescript" className="h-9 text-base md:text-sm" />
      </div>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-foreground">
          <IconAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-tone-warning" />
          <span className="min-w-0 break-words">{problem}</span>
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit">Apply</Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Changes an artifact's format and code language, from its More menu or the
 * "Detected … · Change" chip. A format the content does not fit (JSON that
 * does not parse) is refused here with the reason, and the server checks
 * the save again.
 */
export function FormatDialog({ open, onOpenChange, ...props }: FormatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <FormatForm {...props} onClose={() => { onOpenChange(false); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}
