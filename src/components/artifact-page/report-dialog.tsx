"use client";

import { IconFlag, IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";

import { reportArtifactAction } from "@/app/artifact/[publicId]/actions";
import { FormError } from "@/components/teams/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reportReasons, type ReportReason } from "@/lib/artifact-types";
import { REPORT_DETAILS_MAX_LENGTH, reportReasonLabels } from "@/lib/reports/rules";
import { cn } from "@/lib/utils";

function ReasonPicker({ value, onChange }: { value: ReportReason | null; onChange: (reason: ReportReason) => void }) {
  return (
    <div role="radiogroup" aria-label="Reason" className="grid gap-1.5">
      {reportReasons.map((reason) => (
        <button
          key={reason}
          type="button"
          role="radio"
          aria-checked={value === reason}
          onClick={() => { onChange(reason); }}
          className={cn("rounded-md border px-3 py-2 text-left text-sm transition-colors", value === reason ? "border-foreground bg-muted" : "hover:bg-muted/60")}
        >
          {reportReasonLabels[reason]}
        </button>
      ))}
    </div>
  );
}

function ReportForm({ publicId, onSent }: { publicId: string; onSent: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) {
      setError("Choose a reason for the report.");
      return;
    }
    if (details.trim().length > REPORT_DETAILS_MAX_LENGTH) {
      setError(`Keep the details to ${String(REPORT_DETAILS_MAX_LENGTH)} characters or fewer.`);
      return;
    }
    setError("");
    setSending(true);
    try {
      const result = await reportArtifactAction(publicId, { reason, details });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSent();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      <ReasonPicker value={reason} onChange={(next) => { setReason(next); setError(""); }} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="report-details">Details (optional)</Label>
        <Textarea id="report-details" value={details} onChange={(event) => { setDetails(event.target.value); setError(""); }} placeholder="What is wrong with this artifact?" className="min-h-20" />
      </div>
      <FormError message={error} />
      <DialogFooter>
        <Button type="submit" disabled={sending}>
          {sending ? <IconLoader2 className="animate-spin" /> : null} Send report
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The "Report" link on shared artifact pages and its short form. Works signed
 * out. The team that shared the artifact reviews each report.
 */
export function ReportDialog({ publicId }: { publicId: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setSent(false);
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); }} className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground">
        <IconFlag className="size-3" /> Report
      </button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{sent ? "Thank you" : "Report this artifact"}</DialogTitle>
            <DialogDescription className="leading-6">
              {sent ? "The team that shared it will review your report." : "Tell the team that shared it what is wrong. They can take it down."}
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <DialogFooter>
              <Button onClick={() => { changeOpen(false); }}>Close</Button>
            </DialogFooter>
          ) : (
            <ReportForm publicId={publicId} onSent={() => { setSent(true); }} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
