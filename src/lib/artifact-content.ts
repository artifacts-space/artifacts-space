import { ZodError } from "zod";

import { parseCsv } from "@/lib/csv";
import { checkMermaidSource } from "@/lib/mermaid-source";
import { checkSvg } from "@/lib/svg";
import { formatUiSpecIssues, type UiSpecIssue } from "@/lib/ui/issues";
import { validateUiSpec } from "@/lib/ui/validate";

/** The outcome of checking artifact content against its format. */
export interface ArtifactContentResult {
  valid: boolean;
  issues: UiSpecIssue[];
  /** A short report for agents and people. Empty when there is nothing to say. */
  message: string;
}

function result(issues: UiSpecIssue[]): ArtifactContentResult {
  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    message: issues.length > 0 ? formatUiSpecIssues(issues) : "",
  };
}

function error(code: string, message: string): UiSpecIssue {
  return { severity: "error", code, message };
}

function checkJson(content: string): UiSpecIssue[] {
  try {
    JSON.parse(content);
    return [];
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "it could not be parsed";
    return [error("invalid_json", `The content is not valid JSON: ${reason}.`)];
  }
}

function checkCsv(content: string): UiSpecIssue[] {
  const parsed = parseCsv(content, { maxRows: 0 });
  if (parsed.header.length === 0) return [error("empty_csv", "The CSV has no rows. Start with a header row such as name,value.")];
  return parsed.errors.map((message) => error("invalid_csv", message));
}

const checks: Record<string, (content: string) => UiSpecIssue[]> = {
  json: checkJson,
  csv: checkCsv,
  svg: (content) => {
    const check = checkSvg(content);
    return check.ok ? [] : [error("invalid_svg", check.error ?? "The SVG could not be read.")];
  },
  mermaid: (content) => {
    const problem = checkMermaidSource(content);
    return problem ? [error("invalid_mermaid", problem)] : [];
  },
  ui: (content) => validateUiSpec(content).issues,
};

/**
 * Checks that `content` fits its format. Markdown, code, and text accept any
 * text. JSON must parse, CSV must have a header and closed quotes, SVG must
 * have an <svg> root, Mermaid must name a diagram type, and ui must pass
 * `validateUiSpec`.
 */
export function validateArtifactContent(kind: string, content: string): ArtifactContentResult {
  const check = checks[kind];
  return result(check ? check(content) : []);
}

/**
 * Thrown when content does not fit its format. It is a ZodError, so callers
 * that already report zod messages show it unchanged; `message` is the full report.
 */
export class ArtifactContentError extends ZodError {
  constructor(kind: string, report: string) {
    const summary = `This ${kind} content cannot be saved.\n${report}`;
    super([{ code: "custom", path: ["content"], message: summary, input: undefined }]);
    Object.defineProperty(this, "message", { value: summary });
    this.name = "ArtifactContentError";
  }
}

/** Throws ArtifactContentError when `content` does not fit `kind`. */
export function assertValidArtifactContent(kind: string, content: string): void {
  const checked = validateArtifactContent(kind, content);
  if (!checked.valid) throw new ArtifactContentError(kind, checked.message);
}

/** The saved format and content of an artifact, for checking an update. */
export interface StoredArtifactContent {
  kind: string;
  content: string;
}

/**
 * Checks an update before it is written. When the update changes only the
 * content or only the format, `loadCurrent` supplies the other half from the
 * stored artifact. Does nothing when neither changes.
 */
export async function assertValidArtifactUpdate(
  update: { kind?: string | undefined; content?: string | undefined },
  loadCurrent: () => Promise<StoredArtifactContent | null>,
): Promise<void> {
  const { kind, content } = update;
  if (kind === undefined && content === undefined) return;
  if (kind !== undefined && content !== undefined) {
    assertValidArtifactContent(kind, content);
    return;
  }
  const current = await loadCurrent();
  if (!current) return;
  assertValidArtifactContent(kind ?? current.kind, content ?? current.content);
}
