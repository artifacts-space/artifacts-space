"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

/**
 * A code block in the editor: monospace code with a quiet language picker
 * in its corner. The language is written after the opening fence on save.
 */
export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const attr: unknown = node.attrs.language;
  const language = typeof attr === "string" && attr ? attr : plain;
  return (
    <NodeViewWrapper className="rich-code-block relative">
      <div contentEditable={false} className="absolute top-1.5 right-1.5 z-[1]">
        <Select
          value={language}
          disabled={!editor.isEditable}
          onValueChange={(next) => { updateAttributes({ language: !next || next === plain ? null : next }); }}
        >
          <SelectTrigger size="sm" aria-label="Code language" className="h-7 border-transparent bg-transparent text-xs text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent">
            <SelectValue>{(value: string) => labelFor(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="end">
            {languageOptions(language).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
