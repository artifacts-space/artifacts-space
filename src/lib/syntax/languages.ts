/**
 * The languages code blocks highlight. The server highlights the core set
 * without loading anything at request time; the browser lazy-loads any
 * language here on demand. Anything else shows as plain text.
 */
export const coreLanguages = ["typescript", "tsx", "javascript", "jsx", "json", "shellscript", "python", "sql", "css", "html", "yaml", "markdown", "diff", "go", "rust"] as const;

export const extraLanguages = ["jsonc", "java", "kotlin", "swift", "ruby", "php", "c", "cpp", "csharp", "scss", "toml", "xml", "graphql", "dockerfile"] as const;

export type SyntaxLanguage = (typeof coreLanguages)[number] | (typeof extraLanguages)[number];

const known: ReadonlySet<string> = new Set<string>([...coreLanguages, ...extraLanguages]);

const aliases: Readonly<Record<string, SyntaxLanguage>> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  shell: "shellscript",
  console: "shellscript",
  py: "python",
  yml: "yaml",
  md: "markdown",
  patch: "diff",
  golang: "go",
  rs: "rust",
  htm: "html",
  svg: "xml",
  kt: "kotlin",
  rb: "ruby",
  "c++": "cpp",
  cs: "csharp",
  "c#": "csharp",
  gql: "graphql",
  docker: "dockerfile",
  json5: "jsonc",
};

function isSyntaxLanguage(value: string): value is SyntaxLanguage {
  return known.has(value);
}

/**
 * The highlighter language for a label such as "ts", "TypeScript", or
 * "language-py", or null when the label is empty or not supported.
 */
export function resolveLanguage(label: string | null | undefined): SyntaxLanguage | null {
  const name = label?.trim().toLowerCase().replace(/^language-/, "") ?? "";
  if (name === "") return null;
  if (isSyntaxLanguage(name)) return name;
  return aliases[name] ?? null;
}

const coreSet: ReadonlySet<SyntaxLanguage> = new Set(coreLanguages);

/** True when the server highlights this language without loading anything. */
export function isCoreLanguage(language: SyntaxLanguage): boolean {
  return coreSet.has(language);
}
