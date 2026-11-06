"use client";

import { useDeferredValue, useRef, useState } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { cn } from "@/lib/utils";

import { ContentStatus } from "./content-status";
import { HighlightedTextarea } from "./highlighted-textarea";

type Pane = "write" | "preview";

/** Formats edited as prose in the highlighting textarea. File artifacts hold Markdown notes. */
const proseKinds: ReadonlySet<ArtifactKind> = new Set(["markdown", "text", "file"]);

/** The edit surface's size, shared by both kinds of textarea. */
const surface = "min-h-[50dvh] max-h-none resize-y rounded-none border-transparent bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0 sm:px-5 sm:py-4";

interface ContentEditorProps {
  kind: ArtifactKind;
  value: string;
  onChange: (value: string) => void;
  title: string;
  language: string;
  files: readonly FileDto[];
  label: string;
  autoFocus?: boolean;
}

function SourceField({ kind, value, onChange, label, autoFocus }: Pick<ContentEditorProps, "kind" | "value" | "onChange" | "label" | "autoFocus">) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  if (proseKinds.has(kind)) {
    return (
      <HighlightedTextarea
        textareaRef={textareaRef}
        value={value}
        markdown={kind !== "text"}
        onChange={(event) => { onChange(event.target.value); }}
        aria-label={label}
        autoFocus={autoFocus}
        spellCheck
        className={surface}
      />
    );
  }
  return (
    <Textarea
      value={value}
      onChange={(event) => { onChange(event.target.value); }}
      aria-label={label}
      autoFocus={autoFocus}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      className={cn(surface, "font-mono text-base leading-6 md:text-sm")}
    />
  );
}

/**
 * Edits an artifact's content with a live preview: side by side on wide
 * screens, Write and Preview tabs on phones. Markdown shows its formatting as
 * you type; source formats (ui, JSON, CSV, code, SVG, Mermaid) get a
 * monospace field and a live check against the format's rules.
 */
export function ContentEditor({ kind, value, onChange, title, language, files, label, autoFocus = false }: ContentEditorProps) {
  const [pane, setPane] = useState<Pane>("write");
  const preview = useDeferredValue(value);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-2 py-1.5 lg:hidden">
        <Tabs value={pane} onValueChange={(next: Pane) => { setPane(next); }}>
          <TabsList aria-label={`${label}: write or preview`}>
            <TabsTrigger value="write" className="px-2.5">Write</TabsTrigger>
            <TabsTrigger value="preview" className="px-2.5">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:divide-x">
        <div className={cn("min-w-0 flex-col", pane === "write" ? "flex" : "hidden lg:flex")}>
          <SourceField kind={kind} value={value} onChange={onChange} label={label} autoFocus={autoFocus} />
          <ContentStatus kind={kind} content={value} className="sm:px-5" />
        </div>
        <section aria-label="Preview" className={cn("min-w-0 bg-background/40", pane === "preview" ? "block" : "hidden lg:block")}>
          <p className="hidden border-b px-5 py-2 text-xs text-muted-foreground lg:block">Preview</p>
          <div className="max-h-[75dvh] overflow-y-auto overscroll-contain p-4 sm:p-5">
            <ArtifactView kind={kind} content={preview} title={title} language={language} files={files} />
          </div>
        </section>
      </div>
    </div>
  );
}
