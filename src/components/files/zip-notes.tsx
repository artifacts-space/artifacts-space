"use client";

import { IconFileZip } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fromZipWords } from "@/lib/page-files/zip-rules";

import type { DropSource } from "./use-page-files-intake";
import type { Unpacking } from "./use-zip-unpack";

/** A zip being unpacked in the browser: which, how far, and Cancel, which stops it and adds nothing. */
export function UnpackingZip({ unpacking, onCancel }: { unpacking: Unpacking | null; onCancel: () => void }) {
  if (!unpacking) return null;
  const label = unpacking.name ? `Unpacking ${unpacking.name}` : "Unpacking the zip";
  return (
    <div data-slot="page-zip-unpacking" className="card-nested flex min-w-0 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm">{label}… {unpacking.percent}%</p>
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>Cancel</Button>
      </div>
      <Progress value={unpacking.percent} aria-label={label} />
    </div>
  );
}

/** Where the latest drop's files came from ("From site.zip: 14 files."), with a way to attach each zip as the file it is. */
export function FromZips({ sources, onAttach }: { sources: readonly DropSource[]; onAttach: (key: string) => void }) {
  const words = fromZipWords(sources);
  if (!words) return null;
  return (
    <div data-slot="page-files-from-zip" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">{words}</p>
      {sources.filter((source) => !source.attached).map((source) => (
        <Button key={source.key} type="button" variant="ghost" size="xs" onClick={() => { onAttach(source.key); }}>
          <IconFileZip aria-hidden /> {sources.length === 1 ? "Attach the zip as it is" : `Attach ${source.name} as it is`}
        </Button>
      ))}
    </div>
  );
}
