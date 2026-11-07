/**
 * Server highlighter, resolved through `#syntax-highlight` only under the
 * react-server condition, so its grammars never reach a browser bundle.
 * It is synchronous: the core grammars load with the module, and server
 * components call it while they render.
 */
import { createHighlighterCoreSync, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import css from "shiki/langs/css.mjs";
import diff from "shiki/langs/diff.mjs";
import go from "shiki/langs/go.mjs";
import html from "shiki/langs/html.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import jsx from "shiki/langs/jsx.mjs";
import markdown from "shiki/langs/markdown.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import sql from "shiki/langs/sql.mjs";
import toml from "shiki/langs/toml.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import xml from "shiki/langs/xml.mjs";
import yaml from "shiki/langs/yaml.mjs";

import { isCoreLanguage, resolveLanguage } from "./languages";
import { syntaxTheme } from "./theme";
import { tokenize } from "./tokenize";
import type { SyntaxLine } from "./tokens";

let highlighter: HighlighterCore | null = null;

function getHighlighter(): HighlighterCore {
  highlighter ??= createHighlighterCoreSync({
    themes: [syntaxTheme],
    langs: [css, diff, go, html, javascript, json, jsx, markdown, python, rust, shellscript, sql, toml, tsx, typescript, xml, yaml],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/**
 * Highlights code on the server. Returns null for an unknown language, a
 * language outside the core set (the browser loads those), or code too large
 * to highlight; the code block then shows plain text or highlights itself.
 */
export function highlightCode(code: string, label: string | null | undefined): SyntaxLine[] | null {
  const language = resolveLanguage(label);
  if (!language || !isCoreLanguage(language)) return null;
  try {
    return tokenize(getHighlighter(), code, language);
  } catch {
    return null;
  }
}
