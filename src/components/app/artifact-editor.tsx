"use client";

import {
  Braces,
  Check,
  Code2,
  FileText,
  Globe2,
  Loader2,
  LockKeyhole,
  MoreHorizontal,
  Save,
  Trash2,
} from "lucide-react";
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
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

const kindIcons = { markdown: FileText, code: Code2, text: FileText, json: Braces };

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
  const KindIcon = kindIcons[kind];
  const shareUrl = `${origin}/share/${artifact.shareId}`;

  async function save() {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    setSaving(true);
    const result = await updateArtifactAction(artifact.id, {
      title,
      summary,
      content,
      project,
      language,
      kind,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onUpdated(result.data);
    toast.success("Artifact saved.");
  }

  async function toggleSharing() {
    setSharing(true);
    const nextVisibility = artifact.visibility === "unlisted" ? "private" : "unlisted";
    const result = await setArtifactVisibilityAction(artifact.id, nextVisibility);
    setSharing(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onUpdated(result.data);
    toast.success(nextVisibility === "unlisted" ? "Share link enabled." : "Artifact is private again.");
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
      <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2 sm:px-5">
        <KindIcon className="size-4 shrink-0 text-[#72a5ff]" />
        <span className="font-mono text-[9px] tracking-[0.1em] text-white/25">ARTIFACT / {artifact.id.slice(0, 8)}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <CopyButton value={artifact.content} variant="ghost" className="size-8" />
          <Button variant="ghost" size="icon" onClick={toggleSharing} disabled={sharing} aria-label={artifact.visibility === "unlisted" ? "Disable share link" : "Enable share link"}>
            {sharing ? <Loader2 className="animate-spin" /> : artifact.visibility === "unlisted" ? <Globe2 className="text-[#72a5ff]" /> : <LockKeyhole />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More artifact actions" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 border-white/10 bg-[#1b1c22]">
              <DropdownMenuItem onClick={toggleSharing} className="py-2 text-xs">
                {artifact.visibility === "unlisted" ? <LockKeyhole /> : <Globe2 />}
                {artifact.visibility === "unlisted" ? "Make private" : "Enable share link"}
              </DropdownMenuItem>
              {artifact.visibility === "unlisted" && (
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(shareUrl)} className="py-2 text-xs">
                  <Check /> Copy share link
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)} className="py-2 text-xs">
                <Trash2 /> Delete artifact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={save} disabled={!dirty || saving} className="ml-1 h-8 bg-[#1768ff] px-3 text-xs text-white hover:bg-[#2f76ff]">
            {saving ? <Loader2 className="animate-spin" /> : dirty ? <Save /> : <Check />}
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      {artifact.visibility === "unlisted" && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[#3980ff]/15 bg-[#1768ff]/[0.055] px-5 py-2.5">
          <Globe2 className="size-3.5 text-[#72a5ff]" />
          <span className="text-[11px] text-white/50">Anyone with the link can view this artifact.</span>
          <CopyButton value={shareUrl} label="Copy share link" variant="ghost" className="ml-auto h-7 text-[10px] text-[#8cb5ff]" />
        </div>
      )}

      <div className="border-b border-white/10 px-5 py-5 sm:px-7">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Artifact title"
          className="w-full bg-transparent text-2xl font-medium tracking-[-0.035em] text-white/90 outline-none placeholder:text-white/20 sm:text-3xl"
          placeholder="Untitled artifact"
        />
        <input
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          aria-label="Artifact summary"
          className="mt-3 w-full bg-transparent text-[13px] leading-6 text-white/40 outline-none placeholder:text-white/20"
          placeholder="Add a short summary for search and agent retrieval…"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-white/[0.012] px-5 py-2.5 sm:px-7">
        <div className="flex rounded-md border border-white/10 bg-black/15 p-0.5">
          {(["edit", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "rounded-[5px] px-3 py-1 text-[10px] capitalize transition-colors",
                mode === value ? "bg-white/[0.08] text-white/80" : "text-white/30 hover:text-white/60",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <span className="font-mono text-[9px] text-white/20">{content.length.toLocaleString()} CHARACTERS</span>
        <span className="ml-auto font-mono text-[9px] text-white/20">
          UPDATED {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(artifact.updatedAt)).toUpperCase()}
        </span>
      </div>

      {mode === "edit" ? (
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          aria-label="Artifact content"
          spellCheck={kind === "markdown" || kind === "text"}
          className="min-h-[460px] flex-1 resize-y rounded-none border-0 bg-[#0e0f12] p-6 font-mono text-[12px] leading-7 text-white/65 shadow-none outline-none focus-visible:ring-0 sm:p-8"
        />
      ) : (
        <div className="min-h-[460px] flex-1 bg-[#0e0f12] p-6 sm:p-8">
          <pre className={cn("max-w-[80ch] whitespace-pre-wrap break-words text-[13px] leading-7 text-white/65", kind === "code" || kind === "json" ? "font-mono text-xs" : "font-sans")}>
            {content}
          </pre>
        </div>
      )}

      <div className="grid gap-3 border-t border-white/10 bg-white/[0.012] p-4 sm:grid-cols-3 sm:px-5">
        <label className="flex items-center gap-2 text-[10px] text-white/30">
          <span className="w-14 shrink-0 font-mono text-[9px]">PROJECT</span>
          <Input value={project} onChange={(event) => setProject(event.target.value)} placeholder="Unassigned" className="h-8 border-white/[0.07] bg-white/[0.025] text-[11px]" />
        </label>
        <label className="flex items-center gap-2 text-[10px] text-white/30">
          <span className="w-14 shrink-0 font-mono text-[9px]">FORMAT</span>
          <Select value={kind} onValueChange={(value) => setKind(value as ArtifactKind)}>
            <SelectTrigger className="h-8 w-full border-white/[0.07] bg-white/[0.025] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent className="border-white/10 bg-[#1b1c22]">
              {["markdown", "code", "text", "json"].map((value) => <SelectItem key={value} value={value} className="text-xs">{value}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-[10px] text-white/30">
          <span className="w-14 shrink-0 font-mono text-[9px]">LANGUAGE</span>
          <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Optional" className="h-8 border-white/[0.07] bg-white/[0.025] text-[11px]" />
        </label>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border-white/10 bg-[#191a1f]">
          <DialogHeader>
            <DialogTitle>Delete this artifact?</DialogTitle>
            <DialogDescription className="leading-6 text-white/40">
              “{artifact.title}” will be permanently removed from your workspace and every agent that uses it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" />} Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
