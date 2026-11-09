"use client";

import { IconDownload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { setCsvDownloadAction } from "@/app/(workspace)/app/csv-download-actions";
import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { CSV_DOWNLOAD_LABEL } from "@/lib/csv-export/rules";

/** The setting as the page loaded it, for someone who may change it. */
export interface CsvDownloadSetting {
  artifactId: string;
  on: boolean;
}

/**
 * "Allow CSV download" in the page's More menu, shown only to the author
 * and the team's owners and admins. Off by default: readers who cannot
 * edit then get no download, raw file, Markdown table, or copy.
 */
export function CsvDownloadItem({ setting }: { setting: CsvDownloadSetting | null }) {
  const router = useRouter();
  const [on, setOn] = useState(setting?.on ?? false);
  const [pending, setPending] = useState(false);
  if (!setting) return null;

  async function change(next: boolean) {
    if (!setting) return;
    setPending(true);
    try {
      const result = await setCsvDownloadAction(setting.artifactId, next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOn(result.data);
      toast.success(result.data ? "Readers can now download and copy this sheet." : "Downloads are off. Only editors can download or copy this sheet.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenuCheckboxItem checked={on} disabled={pending} onCheckedChange={(next) => { void change(next); }} className="py-2">
      <IconDownload aria-hidden /> {CSV_DOWNLOAD_LABEL}
    </DropdownMenuCheckboxItem>
  );
}
