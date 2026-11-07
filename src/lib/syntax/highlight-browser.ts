/**
 * Browser highlighter. Code blocks import this module dynamically, only when
 * a block arrives without server highlighting (client-rendered views such as
 * the editor preview, comments, and ui artifacts). Shiki's core, the
 * JavaScript regex engine, and each grammar load on first use.
 */
import type { HighlighterCore, LanguageRegistration } from "shiki/core";

import { resolveLanguage, type SyntaxLanguage } from "./languages";
import { syntaxTheme } from "./theme";
import { tokenize } from "./tokenize";
import type { SyntaxLine } from "./tokens";

type GrammarModule = Promise<{ default: LanguageRegistration[] }>;

const grammars: Record<SyntaxLanguage, () => GrammarModule> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
};

let core: Promise<HighlighterCore> | null = null;
const loading = new Map<SyntaxLanguage, Promise<void>>();

async function createCore(): Promise<HighlighterCore> {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([import("shiki/core"), import("shiki/engine/javascript")]);
  return createHighlighterCore({ themes: [syntaxTheme], langs: [], engine: createJavaScriptRegexEngine() });
}

function getCore(): Promise<HighlighterCore> {
  core ??= createCore().catch((error: unknown) => {
    core = null;
    throw error;
  });
  return core;
}

function ensureLanguage(highlighter: HighlighterCore, language: SyntaxLanguage): Promise<void> {
  const pending = loading.get(language) ?? grammars[language]().then((grammar) => highlighter.loadLanguage(grammar.default));
  loading.set(language, pending);
  return pending.catch((error: unknown) => {
    loading.delete(language);
    throw error;
  });
}

/** Highlights code in the browser, or resolves null for an unknown language or a load failure. */
export async function highlightInBrowser(code: string, label: string | null | undefined): Promise<SyntaxLine[] | null> {
  const language = resolveLanguage(label);
  if (!language) return null;
  try {
    const highlighter = await getCore();
    await ensureLanguage(highlighter, language);
    return tokenize(highlighter, code, language);
  } catch {
    return null;
  }
}
