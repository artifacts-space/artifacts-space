import { safeHref } from "@/lib/link-policy";

const schemePattern = /^[a-z][a-z0-9+.-]*:/i;
const emailPattern = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/** The outcome of reading what a person typed as a link. */
export type LinkInputResult = { kind: "remove" } | { kind: "link"; href: string } | { kind: "invalid" };

/**
 * Reads a typed link. An empty field removes the link. A bare domain gets
 * https://, a bare email address gets mailto:, and the result must pass the
 * artifact link policy, so `javascript:` and other unsafe URLs are refused.
 */
export function readLinkInput(input: string): LinkInputResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "remove" };
  const candidate = withScheme(trimmed);
  const href = safeHref(candidate);
  return href ? { kind: "link", href } : { kind: "invalid" };
}

function withScheme(value: string): string {
  if (schemePattern.test(value) && !/^[^:]+:\d/.test(value)) return value;
  if (emailPattern.test(value)) return `mailto:${value}`;
  return `https://${value}`;
}
