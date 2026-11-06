import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "@/lib/handles";

/**
 * Finds @handle mentions in a markdown comment body.
 *
 * - A mention starts at "@" that follows the start of the text or a character
 *   that cannot be part of a word, path, or email (so "a@b.com" and
 *   "site/@x" are not mentions, and "\@x" is escaped).
 * - The handle follows the username rules: lowercase letters, numbers, and
 *   single hyphens, starting and ending with a letter or number. Input is
 *   matched case-insensitively and returned lowercase.
 * - Fenced code blocks and inline code spans are skipped.
 * - Trailing punctuation ("@x.", "@x,", "@x)") ends the handle.
 * - Each handle is returned once, in order of first appearance.
 */
const fencedBlock = /(^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]{0,3}\2[`~]*[ \t]*(?=\n|$)|$)/g;
const inlineCode = /(`+)[\s\S]*?\1/g;
const mentionPattern = /(?<![a-z0-9@./\\`-])@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?![a-z0-9@]|-[a-z0-9])/gi;

/** Removes code so mentions inside it never count. Keeps newlines so positions stay roughly stable. */
function stripCode(body: string) {
  return body.replace(fencedBlock, (match) => match.replace(/[^\n]/g, " ")).replace(inlineCode, (match) => " ".repeat(match.length));
}

function isHandleShape(handle: string) {
  return handle.length >= HANDLE_MIN_LENGTH && handle.length <= HANDLE_MAX_LENGTH && !handle.includes("--");
}

/** The distinct handles mentioned in a comment body, lowercase, in order. */
export function parseMentions(body: string): string[] {
  const found = new Set<string>();
  for (const match of stripCode(body).matchAll(mentionPattern)) {
    const handle = match[1]?.toLowerCase();
    if (handle && isHandleShape(handle)) found.add(handle);
  }
  return [...found];
}
