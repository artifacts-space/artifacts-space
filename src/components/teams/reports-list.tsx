"use client";

import { IconCheck, IconLoader2, IconLock } from "@tabler/icons-react";

import { dismissReportAction, withdrawReportedAction } from "@/app/(workspace)/app/sharing-actions";
import { visibilityLabel } from "@/components/app/share-options";
import { ArtifactTitleLink } from "@/components/artifact-icon/artifact-title-link";
import { Button } from "@/components/ui/button";
import { reportReasonLabels } from "@/lib/reports/rules";
import type { OpenReportView } from "@/lib/reports/service";

import { useTeamAction } from "./use-team-action";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** Open reports from readers. Withdraw makes the artifact private; dismiss closes the report. */
export function ReportsList({ reports }: { reports: OpenReportView[] }) {
  const { pending, run } = useTeamAction();
  if (reports.length === 0) return <p className="px-5 py-6 text-md text-muted-foreground">No open reports.</p>;
  return (
    <ul>
      {reports.map((report) => (
        <li key={report.reportId} className="flex flex-wrap items-start gap-3 border-b px-5 py-3 last:border-b-0">
          <div className="min-w-0 flex-1">
            <ArtifactTitleLink publicId={report.publicId} title={report.title} icon={report.icon} />
            <p className="mt-0.5 text-sm text-muted-foreground">
              {reportReasonLabels[report.reason]} · {visibilityLabel(report.visibility)} · {dateFormat.format(new Date(report.reportedAt))}
            </p>
            {report.details ? <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5">{report.details}</p> : null}
          </div>
          {report.visibility === "private" ? null : (
            <Button size="sm" variant="outline" className="text-xs" disabled={pending !== null} onClick={() => void run(`${report.reportId}-withdraw`, () => withdrawReportedAction(report.reportId), "Sharing withdrawn. Only the author can read it now.")}>
              {pending === `${report.reportId}-withdraw` ? <IconLoader2 className="animate-spin" /> : <IconLock />} Withdraw sharing
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-xs" disabled={pending !== null} onClick={() => void run(`${report.reportId}-dismiss`, () => dismissReportAction(report.reportId), "Report dismissed.")}>
            {pending === `${report.reportId}-dismiss` ? <IconLoader2 className="animate-spin" /> : <IconCheck />} Dismiss
          </Button>
        </li>
      ))}
    </ul>
  );
}
