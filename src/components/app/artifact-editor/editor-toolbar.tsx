"use client";

import { IconArrowsHorizontal, IconCode, IconCopy, IconDots, IconLock, IconTransform, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";

import { ShowSidebarButton } from "@/components/app/sidebar-visibility";
import { HarnessMenu } from "@/components/harness/harness-menu";
import type { HarnessControl } from "@/components/harness/use-artifact-harness";
import { OpenPageButton } from "@/components/page-width/open-page-button";
import { ProjectMark } from "@/components/projects/project-label";
import { useCopyToClipboard } from "@/components/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import type { ArtifactKind, ArtifactProjectDto } from "@/lib/artifact-types";
import { FULL_WIDTH_LABEL, hasWidthSetting } from "@/lib/page-width/rules";
import { cn } from "@/lib/utils";

import type { FullWidthControl } from "./use-full-width";

/** The raw content behind the page, for advanced edits: shown in place of the page while open. */
export interface SourceToggle {
  open: boolean;
  onToggle: () => void;
}

interface MoreMenuProps {
  /** The raw content, for Copy content. */
  content: string;
  source: SourceToggle;
  /** Opens the Format and language dialog. */
  onChangeFormat: () => void;
  /** Null for a CSV, which is always full width. */
  fullWidth: FullWidthControl | null;
  harness: HarnessControl;
  onRequestDelete: (() => void) | null;
  onWithdraw: (() => void) | null;
}

/** View source, Format and language, Full width, and Made with for every editor; Delete for the author; Withdraw sharing for a team owner or admin editing a teammate's artifact. */
function MoreMenu({ content, source, onChangeFormat, fullWidth, harness, onRequestDelete, onWithdraw }: MoreMenuProps) {
  const { copy } = useCopyToClipboard();
  const copyContent = () => { void copy(content).then((done) => { if (done) toast.success("Copied the content."); }); };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />}>
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={copyContent} className="py-2">
          <IconCopy /> Copy content
        </DropdownMenuItem>
        <DropdownMenuItem onClick={source.onToggle} className="py-2">
          <IconCode /> {source.open ? "Hide source" : "View source"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onChangeFormat} className="py-2">
          <IconTransform /> Format and language
        </DropdownMenuItem>
        {fullWidth ? (
          <DropdownMenuCheckboxItem checked={fullWidth.checked} disabled={fullWidth.pending} onCheckedChange={fullWidth.onChange} className="py-2">
            <IconArrowsHorizontal /> {FULL_WIDTH_LABEL}
          </DropdownMenuCheckboxItem>
        ) : null}
        <HarnessMenu control={harness} />
        {onWithdraw ? (
          <DropdownMenuItem onClick={onWithdraw} className="py-2">
            <IconLock /> Withdraw sharing
          </DropdownMenuItem>
        ) : null}
        {onRequestDelete ? (
          <DropdownMenuItem variant="destructive" onClick={onRequestDelete} className="py-2">
            <IconTrash /> Delete artifact
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface EditorToolbarProps {
  /** For Open: the artifact's own page in a new tab. */
  publicId: string;
  /** The breadcrumb: the artifact's project (null when unfiled) and its title. */
  project: ArtifactProjectDto | null;
  title: string;
  kind: ArtifactKind;
  content: string;
  /** The share button and dialog (ShareControl). Null for teammates: only the author (or the person who added the agent that wrote it) shares. */
  shareControl: React.ReactNode;
  /** The History button and dialog (VersionHistory). */
  history: React.ReactNode;
  /** The Comments button and dialog (CommentsDialog), beside History. */
  comments: React.ReactNode;
  /** The Views button and dialog (ViewsDialog). */
  views: React.ReactNode;
  /** View source in the More menu. */
  source: SourceToggle;
  /** Null for teammates: only the author (or the person who added the agent that wrote it) deletes. */
  onRequestDelete: (() => void) | null;
  /** Set for a team owner or admin editing a teammate's artifact. */
  onWithdraw: (() => void) | null;
  /** The "Full width" setting, in the More menu. */
  fullWidth: FullWidthControl;
  /** "Made with": the agent harness it shows, in the More menu. */
  harness: HarnessControl;
  /** Format and language, in the More menu. */
  onChangeFormat: () => void;
  /** Shown after the breadcrumb, such as the "Detected CSV · Change" chip. */
  notice?: React.ReactNode;
}

/**
 * Where the artifact sits: its project (or Unfiled), then its title. The
 * title is the page's own heading below, so here it is plain text.
 */
export function ArtifactBreadcrumb({ project, title }: { project: ArtifactProjectDto | null; title: string }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="flex min-w-0 shrink-0 items-center gap-1.5 text-muted-foreground max-sm:hidden">
          <ProjectMark name={project?.name ?? null} icon={project?.icon ?? null} />
          <span className="max-w-48 truncate">{project?.name ?? "Unfiled"}</span>
          <span aria-hidden>/</span>
        </li>
        <li aria-current="page" className="min-w-0 truncate font-medium text-foreground">{title || "Untitled artifact"}</li>
      </ol>
    </nav>
  );
}

/** The toolbar of a new artifact before it is stored: there is nothing to copy, share, or look back on yet. */
export function BlankToolbar({ kind, notice, onChangeFormat }: { kind: ArtifactKind; notice?: React.ReactNode; onChangeFormat: () => void }) {
  return (
    <div className={toolbarClass}>
      <ShowSidebarButton />
      <KindMark kind={kind} />
      <span className="text-sm font-medium">New artifact</span>
      {notice}
      {/* Start a table, an interface, a diagram, or code directly: the format's starter fills the empty page. */}
      <Button type="button" variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={onChangeFormat}>
        <IconTransform aria-hidden /> Format
      </Button>
    </div>
  );
}

const toolbarClass = "flex min-h-14 flex-wrap items-center gap-2 border-b px-4 py-2 max-md:sticky max-md:top-14 max-md:z-10 max-md:bg-card sm:px-5";

function KindMark({ kind }: { kind: ArtifactKind }) {
  const KindIcon = kindIcons[kind];
  return <KindIcon className={cn("size-4 shrink-0", kindColors[kind])} />;
}

/**
 * The editor's top bar: the breadcrumb (project / title) on the left;
 * Comments, History, Views, Share, Open, and more actions (Copy content, View
 * source, Format, Delete) on the right. Changes save on their own, so there
 * is no Save button. On phones the page scrolls, so it sticks under the app
 * header (h-14) to keep History in reach; from md up the /app shell keeps it
 * in place.
 */
export function EditorToolbar({ publicId, project, title, kind, content, shareControl, history, comments, views, source, onRequestDelete, onWithdraw, fullWidth, harness, onChangeFormat, notice }: EditorToolbarProps) {
  return (
    <div className={toolbarClass}>
      <ShowSidebarButton />
      <ArtifactBreadcrumb project={project} title={title} />
      {notice}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {comments}
        {history}
        {views}
        {shareControl}
        <OpenPageButton publicId={publicId} />
        <MoreMenu content={content} source={source} onChangeFormat={onChangeFormat} fullWidth={hasWidthSetting(kind) ? fullWidth : null} harness={harness} onRequestDelete={onRequestDelete} onWithdraw={onWithdraw} />
      </div>
    </div>
  );
}
