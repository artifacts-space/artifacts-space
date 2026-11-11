/**
 * Mermaid diagrams inside Markdown documents: a fenced code block whose
 * language is `mermaid` draws as a diagram (markdown-dialect.md). The source
 * stays the fenced block, so agents read and write it unchanged.
 */

/** The fence language that turns a code block into a diagram. */
export const MERMAID_LANGUAGE = "mermaid";

/** Longest reason shown under "Couldn't draw this diagram". */
const maxReasonLength = 160;

/**
 * True when a fenced block's info string names Mermaid: its first word is
 * `mermaid`, in any case (```` ```mermaid ````, ```` ```Mermaid title ````).
 */
export function isMermaidLanguage(info: unknown): boolean {
  if (typeof info !== "string") return false;
  const [first = ""] = info.trim().split(/\s+/u);
  return first.toLowerCase() === MERMAID_LANGUAGE;
}

/**
 * A short reason for a diagram that could not be drawn, as one sentence: the
 * first line of Mermaid's message (its later lines point at columns in the
 * source), ending in a period, or capped with an ellipsis. Empty when the
 * message says nothing.
 */
export function diagramFailureReason(message: string): string {
  const first = message.split(/\r?\n/u).map((line) => line.trim()).find((line) => line !== "") ?? "";
  const reason = first.replace(/[:.\s]+$/u, "");
  if (!reason) return "";
  return reason.length >= maxReasonLength ? `${reason.slice(0, maxReasonLength - 1)}…` : `${reason}.`;
}
