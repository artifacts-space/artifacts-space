"use client";

import {
  IconCheck,
  IconDots,
  IconLink,
  IconLoader2,
  IconLock,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  deleteArtifactAction,
  setArtifactVisibilityAction,
  updateArtifactAction,
} from "@/app/(workspace)/app/actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { kindColors, kindIcons, kinds } from "@/lib/artifact-kinds";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function ArtifactEditor({
  artifact,
  origin,
  onUpdated,
  onDeleted,
}: {
  artifact: ArtifactDto;
  origin: string;
  onUpdated: (artifact: ArtifactDto) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(artifact.title);
  const [summary, setSummary] = useState(artifact.summary);
  const [content, setContent] = useState(artifact.content);
  const [project, setProject] = useState(artifact.project);
  const [language, setLanguage] = useState(artifact.language);
  const [kind, setKind] = useState<ArtifactKind>(artifact.kind);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dirty =
    title !== artifact.title ||
    summary !== artifact.summary ||
    content !== artifact.content ||
    project !== artifact.project ||
    language !== artifact.language ||
    kind !== artifact.kind;
  const shared = artifact.visibility === "unlisted";
  const KindIcon = kindIcons[kind];
  const shareUrl = `${origin}/share/${artifact.shareId}`;

  async function save() {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    setSaving(true);
    const result = await updateArtifactAction(artifact.id, { title, summary, content, project, language, kind });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onUpdated(result.data);
    toast.success("Saved.");
  }

  async function toggleSharing() {
    setSharing(true);
    const nextVisibility = shared ? "private" : "unlisted";
    const result = await setArtifactVisibilityAction(artifact.id, nextVisibility);
    setSharing(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onUpdated(result.data);
    toast.success(nextVisibility === "unlisted" ? "Share link enabled." : "Share link disabled.");
  }

  async function remove() {
    setDeleting(true);
    const result = await deleteArtifactAction(artifact.id);
    setDeleting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setDeleteOpen(false);
    onDeleted(artifact.id);
    toast.success("Artifact deleted.");
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={`Edit ${artifact.title}`}>
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-4 py-2 sm:px-5">
        <KindIcon className={cn("size-4 shrink-0", kindColors[kind])} />
        <span className="font-mono text-xs text-muted-foreground">{artifact.id.slice(0, 8)}</span>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton value={artifact.content} variant="ghost" size="icon" />
          <Button variant="ghost" size="icon" onClick={toggleSharing} disabled={sharing} aria-label={shared ? "Disable share link" : "Enable share link"}>
            {sharing ? <IconLoader2 className="animate-spin" /> : shared ? <IconLink /> : <IconLock />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />}>
              <IconDots />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={toggleSharing} className="py-2 text-xs">
                {shared ? <IconLock /> : <IconLink />}
                {shared ? "Disable share link" : "Enable share link"}
              </DropdownMenuItem>
              {shared && (
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(shareUrl)} className="py-2 text-xs">
                  <IconCheck /> IconCopy share link
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)} className="py-2 text-xs">
                <IconTrash /> Delete artifact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={save} disabled={!dirty || saving} className="ml-1 px-3">
            {saving && <IconLoader2 className="animate-spin" />}
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      {shared && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-5 py-2">
          <IconLink className="size-3.5 text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">Anyone with the link can read this artifact.</span>
          <CopyButton value={shareUrl} label="Copy link" variant="ghost" size="sm" className="ml-auto text-xs" />
        </div>
      )}

      <div className="border-b px-5 py-5 sm:px-7">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Artifact title"
          className="w-full bg-transparent text-2xl font-medium tracking-[-0.015em] outline-none placeholder:text-muted-foreground/60"
          placeholder="Untitled artifact"
        />
        <input
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          aria-label="Artifact summary"
          className="mt-2 w-full bg-transparent text-sm leading-6 text-muted-foreground outline-none placeholder:text-muted-foreground/60"
          placeholder="Add a one-line summary for search and agent retrieval"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b bg-background/60 px-5 py-2 sm:px-7">
        <div className="flex rounded-sm border bg-muted p-0.5" role="tablist" aria-label="Editor mode">
          {(["edit", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "rounded-[3px] px-2.5 py-0.5 text-xs capitalize transition-colors",
                mode === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{content.length.toLocaleString()} characters</span>
        <span className="ml-auto text-xs text-muted-foreground">Updated {dateFormat.format(new Date(artifact.updatedAt))}</span>
      </div>

      {mode === "edit" ? (
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          aria-label="Artifact content"
          spellCheck={kind === "markdown" || kind === "text"}
          className="min-h-[460px] flex-1 resize-y rounded-none border-0 bg-card p-6 font-mono text-[12.5px] leading-7 shadow-none outline-none focus-visible:ring-0 sm:p-8"
        />
      ) : (
        <div className="min-h-[460px] flex-1 bg-card p-6 sm:p-8">
          <pre className={cn("max-w-[80ch] whitespace-pre-wrap break-words leading-7", kind === "code" || kind === "json" ? "font-mono text-[12.5px]" : "font-sans text-[14px]")}>
            {content}
          </pre>
        </div>
      )}

      <div className="grid gap-3 border-t bg-background/60 p-4 sm:grid-cols-3 sm:px-5">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-16 shrink-0">Project</span>
          <Input value={project} onChange={(event) => setProject(event.target.value)} placeholder="None" className="h-8 bg-card text-[13px]" />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-16 shrink-0">Format</span>
          <Select value={kind} onValueChange={(value) => setKind(value as ArtifactKind)}>
            <SelectTrigger className="h-8 w-full bg-card text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {kinds.map((value) => <SelectItem key={value} value={value} className="text-xs">{value}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-16 shrink-0">Language</span>
          <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Optional" className="h-8 bg-card text-[13px]" />
        </label>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this artifact?</DialogTitle>
            <DialogDescription className="leading-6">
              “{artifact.title}” will be removed for you and for every agent that reads it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <IconLoader2 className="animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
