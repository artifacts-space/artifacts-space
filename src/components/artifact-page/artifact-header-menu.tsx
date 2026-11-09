"use client";

import { IconAlertTriangle, IconArrowsHorizontal, IconCheck, IconCode, IconDots, IconHistory, IconLoader2, IconRefresh } from "@tabler/icons-react";

import type { FullWidthControl } from "@/components/app/artifact-editor/use-full-width";
import { VersionHistory } from "@/components/history/version-history";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FULL_WIDTH_LABEL } from "@/lib/page-width/rules";
import { siteDefaultTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import { themeChromeProps } from "@/lib/themes/style";
import { cn } from "@/lib/utils";

import { usePageEditorChrome, type PageEditorChrome } from "./page-editor-chrome";
import { idleSave, type SaveIndicatorState, type SaveTone } from "./save-indicator-rules";

const toneIcons: Record<Exclude<SaveTone, "idle">, React.ReactNode> = {
  saving: <IconLoader2 aria-hidden className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none sm:hidden" />,
  saved: <IconCheck aria-hidden className="size-3.5 shrink-0 sm:hidden" />,
  problem: <IconAlertTriangle aria-hidden className="size-3.5 shrink-0 text-tone-warning" />,
};

/**
 * The quiet "Saving… / Saved" beside the More menu, or why the latest
 * change is not saved. On phones it is an icon and the words stay for
 * screen readers; the full text is also the tooltip, so a long reason never
 * pushes the header onto two lines.
 */
function SaveIndicator({ save }: { save: SaveIndicatorState }) {
  const { tone, label } = save;
  return (
    <span
      role="status"
      aria-live="polite"
      data-slot="save-indicator"
      data-tone={tone}
      title={label ?? undefined}
      className={cn("flex min-w-0 items-center gap-1.5 text-xs", tone === "problem" ? "text-foreground" : "text-muted-foreground")}
    >
      {tone === "idle" ? null : toneIcons[tone]}
      {/* On phones an icon tells the state; from sm the words do, with the warning icon kept for problems. */}
      <span className="truncate max-sm:sr-only sm:max-w-48 lg:max-w-72">{label}</span>
    </span>
  );
}

interface MoreMenuProps {
  chrome: PageEditorChrome | null;
  onHistory: () => void;
  theme: Theme | null;
}

/**
 * Why the latest change is not saved, at the top of the menu, and "Try
 * saving again" after a failed save. On phones the header shows only a
 * warning icon and touch screens have no tooltips, so the reason is here.
 */
function SaveProblemItems({ save }: { save: SaveIndicatorState | undefined }) {
  if (save?.tone !== "problem" || !save.label) return null;
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel data-slot="save-problem" className="flex items-start gap-1.5 text-foreground">
          <IconAlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-tone-warning" /> <span>{save.label}</span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      {save.onRetry ? <DropdownMenuItem onClick={save.onRetry} className="py-2"><IconRefresh /> Try saving again</DropdownMenuItem> : null}
      <DropdownMenuSeparator />
    </>
  );
}

/** The "Full width" checkbox; it waits (disabled) while the editable copy loads or a change is saving. */
function FullWidthItem({ control }: { control: FullWidthControl | undefined }) {
  if (!control) return null;
  return (
    <DropdownMenuCheckboxItem checked={control.checked} disabled={control.pending} onCheckedChange={control.onChange} className="py-2">
      <IconArrowsHorizontal /> {FULL_WIDTH_LABEL}
    </DropdownMenuCheckboxItem>
  );
}

/** The page header's "⋯": why a change is not saved (and Try again after a failed save), Full width, History, and View source. Disabled until the editor is ready. */
function MoreMenu({ chrome, onHistory, theme }: MoreMenuProps) {
  // Menus open in a layer above the page, so the popup takes the artifact theme's colors itself, like the header around its button.
  const popup = themeChromeProps(theme ?? siteDefaultTheme());
  const source = chrome?.source ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" disabled={!chrome} />}>
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn("w-60", popup.modeClass)} style={popup.style}>
        <SaveProblemItems save={chrome?.save} />
        <FullWidthItem control={chrome?.fullWidth} />
        <DropdownMenuItem onClick={onHistory} className="py-2"><IconHistory /> History</DropdownMenuItem>
        <DropdownMenuItem onClick={source?.onToggle} disabled={!source} className="py-2">
          <IconCode /> {source?.open ? "Hide source" : "View source"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The editing controls at the end of the artifact page's header, for people
 * who may edit it: the save status and the More menu. The page renders it
 * only for editors, so readers get no "⋯" at all. It reads what the editor
 * publishes (page-editor-chrome.tsx); until then the "⋯" holds its place,
 * disabled, so the header never shifts. History opens the same dialog as in
 * /app, and the menu returns focus to its button when it closes.
 */
export function ArtifactHeaderMenu({ theme = null }: { theme?: Theme | null }) {
  const chrome = usePageEditorChrome();
  if (!chrome) {
    return (
      <>
        <SaveIndicator save={idleSave} />
        <MoreMenu chrome={null} onHistory={noHistory} theme={theme} />
      </>
    );
  }
  return (
    <>
      <SaveIndicator save={chrome.save} />
      <VersionHistory {...chrome.history} trigger={(openHistory) => <MoreMenu chrome={chrome} onHistory={openHistory} theme={theme} />} />
    </>
  );
}

const noHistory = () => undefined;
