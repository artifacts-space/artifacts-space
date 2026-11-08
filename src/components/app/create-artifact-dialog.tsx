"use client";

import { IconChevronDown, IconLoader2, IconMoodSmile, IconPalette, IconPhoto } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { createArtifactWithFilesAction, deleteFileAction } from "@/app/(workspace)/app/file-actions";
import { newArtifactThemeChoicesAction } from "@/app/(workspace)/teams/theme-actions";
import { teamPresetNames } from "@/components/artifact-theme/theme-options";
import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { IconPicker } from "@/components/artifact-icon/icon-picker";
import { ThemePicker } from "@/components/artifact-theme/theme-picker";
import { CoverPicker } from "@/components/artifact-cover/cover-picker";
import { FileUploader } from "@/components/files/file-uploader";
import { useFileUploads } from "@/components/files/use-file-uploads";
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
import { Textarea } from "@/components/ui/textarea";
import { formatInfo } from "@/lib/artifact-formats";
import { iconFileId } from "@/lib/artifact-icons";
import { kinds } from "@/lib/artifact-kinds";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { themeLabel } from "@/lib/themes/artifact-theme";
import { noThemeChoices, type ThemeChoices } from "@/lib/themes/theme-choice-types";
import { coverLabel } from "@/lib/covers/cover";
import { coverGradient, coverGradientCss } from "@/lib/covers/gradients";

/** A short starting point shown in the empty content box, per format. */
const placeholders: Record<string, string> = {
  markdown: "## Decision",
  code: "export function main() {}",
  text: "Notes",
  json: '{ "key": "value" }',
  csv: "name,value\nAda,1",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">…</svg>',
  mermaid: "flowchart TD\n  A --> B",
  ui: '{ "version": 1, "root": "page", "elements": { … } }',
  file: "What these files are and how to use them",
};

/** The icon button beside the title: the chosen icon, or a smiley that opens the picker. */
function NewIconButton({ icon, onChange }: { icon: string | null; onChange: (icon: string | null) => void }) {
  const trigger = (
    <Button type="button" variant="outline" size="icon" className="size-9 shrink-0" aria-label={icon ? "Change icon" : "Add icon"} title={icon ? "Change icon" : "Add icon"}>
      {icon ? <ArtifactIcon icon={icon} /> : <IconMoodSmile className="text-muted-foreground" />}
    </Button>
  );
  return <IconPicker value={icon} onChange={onChange} trigger={trigger} />;
}

/** The team presets the person may use on a new artifact, loaded once when the dialog opens. Built-ins work without them. */
function useNewArtifactThemeChoices(): ThemeChoices {
  const [choices, setChoices] = useState<ThemeChoices>(noThemeChoices);
  useEffect(() => {
    let current = true;
    newArtifactThemeChoicesAction()
      .then((result) => { if (current && result.success) setChoices(result.data); })
      .catch(() => undefined);
    return () => { current = false; };
  }, []);
  return choices;
}

/** The theme field: the chosen preset's name, opening the swatch picker with the built-ins and the person's team presets. */
function NewThemeButton({ theme, onChange }: { theme: string | null; onChange: (theme: string | null) => void }) {
  const choices = useNewArtifactThemeChoices();
  const names = useMemo(() => teamPresetNames(choices), [choices]);
  const trigger = (
    <Button type="button" variant="outline" id="artifact-theme" aria-labelledby="artifact-theme-label artifact-theme" className="h-9 w-full justify-start font-normal">
      <IconPalette className="text-muted-foreground" /> {themeLabel(theme, names)}
      <IconChevronDown className="ml-auto text-muted-foreground" />
    </Button>
  );
  return <ThemePicker value={theme} onChange={onChange} trigger={trigger} choices={choices} />;
}

/** The cover field: a small sample and the gradient's name, opening the gradient picker. */
function NewCoverButton({ cover, onChange }: { cover: string | null; onChange: (cover: string | null) => void }) {
  const gradient = cover ? coverGradient(cover) : undefined;
  const trigger = (
    <Button type="button" variant="outline" id="artifact-cover" aria-labelledby="artifact-cover-label artifact-cover" className="h-9 w-full justify-start font-normal">
      {gradient ? <span aria-hidden className="size-4 rounded-sm" style={{ backgroundImage: coverGradientCss(gradient) }} /> : <IconPhoto className="text-muted-foreground" />}
      {cover ? coverLabel(cover) : "No cover"}
      <IconChevronDown className="ml-auto text-muted-foreground" />
    </Button>
  );
  return <CoverPicker value={cover} onChange={onChange} trigger={trigger} align="start" />;
}

/** Reads a text field from form data. File inputs and missing fields read as empty. */
function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function CreateArtifactDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (artifact: ArtifactDto) => void;
}) {
  const [pending, setPending] = useState(false);
  const [kind, setKind] = useState<ArtifactKind>("markdown");
  const [icon, setIcon] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const uploads = useFileUploads();
  const isFiles = kind === "file";

  function close() {
    uploads.reset({ deleteUploads: true });
    // An image picked as the icon was uploaded but never used; the cleanup job is the backstop.
    const unusedIconFile = iconFileId(icon);
    if (unusedIconFile) void deleteFileAction(unusedIconFile).catch(() => undefined);
    setIcon(null);
    setTheme(null);
    setCover(null);
    onOpenChange(false);
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    try {
      const fileIds = isFiles ? uploads.readyFiles.map((file) => file.id) : [];
      if (isFiles && fileIds.length === 0) {
        toast.error("Add at least one file.");
        return;
      }
      const result = await createArtifactWithFilesAction({
        title: formText(formData, "title"),
        summary: formText(formData, "summary"),
        project: formText(formData, "project"),
        language: formText(formData, "language"),
        content: formText(formData, "content"),
        kind,
        icon,
        theme,
        cover,
      }, fileIds);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onCreated(result.data);
      uploads.reset({ deleteUploads: !isFiles });
      onOpenChange(false);
      form.reset();
      setKind("markdown");
      setIcon(null);
      setTheme(null);
      setCover(null);
      toast.success("Artifact created.");
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) onOpenChange(true); else close(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto overscroll-contain p-0 sm:max-w-2xl">
        <form onSubmit={(event) => void submit(event)} noValidate>
          <DialogHeader className="border-b p-6">
            <DialogTitle className="text-lg">New artifact</DialogTitle>
            <DialogDescription>
              Agents find artifacts by title, summary, and project. Pick the format that shows your content best.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-title">Title</Label>
                <div className="flex items-center gap-2">
                  <NewIconButton icon={icon} onChange={setIcon} />
                  <Input id="artifact-title" name="title" required maxLength={160} autoFocus placeholder="Authentication architecture decision" className="h-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="artifact-project">Project</Label>
                <Input id="artifact-project" name="project" maxLength={120} placeholder="artifacts-space" className="h-9" />
              </div>
              <div className="flex flex-col gap-2">
                <Label id="artifact-format-label">Format</Label>
                <Select value={kind} onValueChange={(value) => { if (value) setKind(value); }}>
                  <SelectTrigger aria-labelledby="artifact-format-label" aria-describedby="artifact-format-help" className="h-9 w-full">
                    <SelectValue>{(value: ArtifactKind) => formatInfo[value].label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((value) => (
                      <SelectItem key={value} value={value}>{formatInfo[value].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="artifact-format-help" className="text-sm leading-5 text-muted-foreground">{formatInfo[kind].helper}</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-summary">Summary <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="artifact-summary" name="summary" maxLength={600} placeholder="One line, used for search and agent retrieval" className="h-9" />
              </div>
              <div className="flex flex-col gap-2">
                <Label id="artifact-theme-label">Theme</Label>
                <NewThemeButton theme={theme} onChange={setTheme} />
              </div>
              <div className="flex flex-col gap-2">
                <Label id="artifact-cover-label">Cover</Label>
                <NewCoverButton cover={cover} onChange={setCover} />
              </div>
              {kind === "code" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="artifact-language">Language</Label>
                  <Input id="artifact-language" name="language" maxLength={60} placeholder="typescript" className="h-9" />
                </div>
              )}
              {isFiles ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label id="artifact-files-label">Files</Label>
                  <FileUploader items={uploads.items} onFiles={uploads.addFiles} onRemove={(key) => { uploads.remove(key); }} />
                </div>
              ) : null}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="artifact-content">{isFiles ? <>Notes <span className="font-normal text-muted-foreground">(optional)</span></> : "Content"}</Label>
                <Textarea
                  id="artifact-content"
                  name="content"
                  placeholder={placeholders[kind]}
                  className={isFiles ? "min-h-24 resize-y p-4 leading-6 md:text-md" : "min-h-56 resize-y p-4 font-mono leading-6"}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="m-0 rounded-none border-t bg-muted/40 px-6 py-4">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={pending || uploads.busy}>
              {pending && <IconLoader2 className="animate-spin" />}
              {pending ? "Creating…" : "Create artifact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
