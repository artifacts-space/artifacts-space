import type { ThemeRegistration } from "shiki/core";

import type { SyntaxKind } from "./tokens";

const color = (kind: SyntaxKind) => `var(--syntax-${kind})`;

/** The theme's name, passed to Shiki with every highlight call. */
export const syntaxThemeName = "artifacts-syntax";

/**
 * A Shiki theme whose every color is a `var(--syntax-*)` token, so light and
 * dark mode come from globals.css and no literal color reaches a component.
 * Scopes not listed keep the code block's foreground.
 */
export const syntaxTheme: ThemeRegistration = {
  name: syntaxThemeName,
  type: "light",
  colors: { "editor.foreground": "var(--syntax-plain)", "editor.background": "transparent" },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment", "string.quoted.docstring.multi"], settings: { foreground: color("comment") } },
    {
      scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.operator.new", "keyword.operator.expression", "keyword.control", "entity.name.tag", "support.type.primitive", "variable.language.this", "variable.language.self"],
      settings: { foreground: color("keyword") },
    },
    { scope: ["keyword.operator", "keyword.operator.assignment", "keyword.operator.arithmetic", "keyword.operator.logical", "keyword.operator.comparison"], settings: { foreground: color("punctuation") } },
    { scope: ["string", "string.quoted", "string.template", "string.regexp", "markup.inline.raw", "markup.fenced_code"], settings: { foreground: color("string") } },
    { scope: ["punctuation.definition.string", "punctuation.definition.template-expression"], settings: { foreground: color("string") } },
    {
      scope: ["constant.numeric", "constant.language", "constant.character", "constant.other", "variable.other.constant", "support.constant", "keyword.other.unit"],
      settings: { foreground: color("number") },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function", "entity.name.type", "entity.name.class", "support.class", "support.type", "entity.other.inherited-class", "entity.name.section.markdown", "markup.heading"],
      settings: { foreground: color("function") },
    },
    {
      scope: ["support.type.property-name", "meta.object-literal.key", "variable.other.property", "variable.other.object.property", "entity.other.attribute-name", "entity.name.tag.yaml", "support.type.property-name.json", "variable.parameter", "markup.underline.link"],
      settings: { foreground: color("property") },
    },
    { scope: ["punctuation", "meta.brace", "punctuation.separator", "punctuation.terminator", "punctuation.accessor", "meta.tag punctuation.definition.tag"], settings: { foreground: color("punctuation") } },
    { scope: ["markup.inserted", "punctuation.definition.inserted", "meta.diff.header.to-file"], settings: { foreground: color("inserted") } },
    { scope: ["markup.deleted", "punctuation.definition.deleted", "meta.diff.header.from-file"], settings: { foreground: color("deleted") } },
    { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
  ],
};
