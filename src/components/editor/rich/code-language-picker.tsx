"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const plain = "plain";

/** Languages offered for code blocks, by their usual fence name. */
export const codeLanguages: readonly { value: string; label: string }[] = [
  { value: plain, label: "Plain text" },
  { value: "bash", label: "Bash" },
  { value: "css", label: "CSS" },
  { value: "diff", label: "Diff" },
  { value: "go", label: "Go" },
  { value: "html", label: "HTML" },
  { value: "java", label: "Java" },
  { value: "js", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "jsx", label: "JSX" },
  { value: "md", label: "Markdown" },
  { value: "mermaid", label: "Mermaid diagram" },
  { value: "python", label: "Python" },
  { value: "ruby", label: "Ruby" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "swift", label: "Swift" },
  { value: "ts", label: "TypeScript" },
  { value: "tsx", label: "TSX" },
  { value: "yaml", label: "YAML" },
];

/**
 * The language choices for a block: the standard list, plus the block's own
 * language when an agent wrote one that is not on it, so it is never lost.
 */
export function languageOptions(current: string): { value: string; label: string }[] {
  if (!current || codeLanguages.some((option) => option.value === current)) return [...codeLanguages];
  return [...codeLanguages, { value: current, label: current }];
}

function labelFor(value: string) {
  return languageOptions(value).find((option) => option.value === value)?.label ?? value;
}

/** The block's language from its attributes, or "plain". */
export function blockLanguage(attr: unknown): string {
  return typeof attr === "string" && attr ? attr : plain;
}

/**
 * The quiet language picker in a code block's corner. Choosing Plain text
 * clears the language. `className` replaces the corner placement, for a
 * picker that sits in a toolbar instead.
 */
export function CodeLanguagePicker({ language, disabled, onChange, className }: { language: string; disabled: boolean; onChange: (language: string | null) => void; className?: string }) {
  return (
    <div contentEditable={false} className={cn("absolute top-1.5 right-1.5 z-[1]", className)}>
      <Select
        value={language}
        disabled={disabled}
        onValueChange={(next) => { onChange(!next || next === plain ? null : next); }}
      >
        <SelectTrigger size="sm" aria-label="Code language" className="h-7 border-transparent bg-transparent text-xs text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent">
          <SelectValue>{(value: string) => labelFor(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="end">
          {languageOptions(language).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
