"use client";

import { IconDots } from "@tabler/icons-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { cell } from "./member-table-cells";

/**
 * The first cell: avatar, name with an optional badge, and a muted second
 * line. On phones `phoneNote` joins the second line, standing in for the
 * Added by and Status columns that are hidden there.
 */
export function NameCell({ avatar, name, badge, detail, phoneNote }: { avatar: React.ReactNode; name: React.ReactNode; badge?: React.ReactNode; detail: string; phoneNote?: string | undefined }) {
  return (
    // max-w-0 with w-full lets this column take the free width and truncate instead of widening the table.
    <td className={`${cell.first} w-full max-w-0`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0">{avatar}</span>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 font-medium">
            <span className="truncate">{name}</span>
            {badge}
          </p>
          {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
          {phoneNote ? <p className="truncate text-xs text-muted-foreground sm:hidden">{phoneNote}</p> : null}
        </div>
      </div>
    </td>
  );
}

/** The ⋯ menu at the end of a row. `label` names the row for screen readers. */
export function RowMenu({ label, disabled, children }: { label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" />}
        aria-label={label}
        disabled={disabled}
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 data-[popup-open]:bg-muted"
      >
        <IconDots aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
