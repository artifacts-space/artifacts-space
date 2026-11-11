"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";

import { isMermaidLanguage } from "@/lib/markdown/mermaid-fence";

import { blockLanguage, CodeLanguagePicker } from "./code-language-picker";
import { MermaidBlockView } from "./mermaid-block-view";

export { languageOptions } from "./code-language-picker";

/**
 * A code block in the editor: monospace code with a quiet language picker
 * in its corner. The language is written after the opening fence on save.
 * A ```mermaid block shows its diagram instead (mermaid-block-view.tsx).
 */
export function CodeBlockView(props: ReactNodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const language = blockLanguage(node.attrs.language);
  if (isMermaidLanguage(language)) return <MermaidBlockView {...props} />;
  return (
    <NodeViewWrapper className="rich-code-block relative">
      <CodeLanguagePicker language={language} disabled={!editor.isEditable} onChange={(next) => { updateAttributes({ language: next }); }} />
      <pre spellCheck={false}>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
