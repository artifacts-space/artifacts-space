"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";

import { isMermaidLanguage } from "@/lib/markdown/mermaid-fence";

import { useCodeBlockAttrs } from "./code-block-attrs";
import { BlockCaptionField, CodeBlockToolbar } from "./code-block-toolbar";
import { blockLanguage } from "./code-language-picker";
import { MermaidBlockView } from "./mermaid-block-view";

export { languageOptions } from "./code-language-picker";

/** A code block that is not a diagram: the toolbar, then the code. */
function PlainCodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const attrs = useCodeBlockAttrs(node.attrs.language, updateAttributes);
  return (
    <NodeViewWrapper className="rich-code-block group/code">
      <div className="rich-code-frame">
        <CodeBlockToolbar
          language={attrs.language}
          code={node.textContent}
          editable={editor.isEditable}
          view={null}
          wrap={attrs.fence.wrap}
          captionShown={attrs.captionShown}
          onLanguage={attrs.setLanguage}
          onView={attrs.setView}
          onWrap={attrs.setWrap}
          onCaption={attrs.openCaption}
        />
        <pre spellCheck={false} data-wrap={attrs.fence.wrap ? "" : undefined}>
          <NodeViewContent<"code"> as="code" />
        </pre>
      </div>
      <BlockCaptionField attrs={attrs} />
    </NodeViewWrapper>
  );
}

/**
 * A code block in the editor: a toolbar with the language picker on the
 * left and Copy, Wrap code, and Caption on the right, then the code, then
 * the caption. The language and its attributes are written after the
 * opening fence on save (markdown-dialect.md). A ```mermaid block shows its
 * diagram (mermaid-block-view.tsx).
 */
export function CodeBlockView(props: ReactNodeViewProps) {
  if (isMermaidLanguage(blockLanguage(props.node.attrs.language))) return <MermaidBlockView {...props} />;
  return <PlainCodeBlockView {...props} />;
}
