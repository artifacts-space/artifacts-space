import { currentFormatKinds, type FormatKind } from "@/lib/artifact-formats";

type LandingFormat = Exclude<FormatKind, "ui" | "canvas" | "file">;

/**
 * The formats the landing page names: the current ones a person can start
 * on the web. The earlier formats (`ui`, `canvas`) are kept for the
 * artifacts that use them and are not put forward for new work, and Files
 * is not a format a person picks on the web (`offeredFormats` in
 * format-choice-rules.ts): there a file goes into a document or is attached
 * beside any other format, so the line says that instead.
 */
export const landingFormatKinds = currentFormatKinds.filter((kind): kind is LandingFormat => kind !== "file");

/** What each of those formats is called in landing copy: what the person gets, in plain words. */
const formatWords: Record<LandingFormat, string> = {
  markdown: "Markdown docs",
  html: "web pages",
  code: "code",
  text: "plain text",
  json: "JSON",
  csv: "CSV tables",
  svg: "SVG images",
  mermaid: "diagrams",
};

const listWords = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** The pricing line about formats, built from the format list so it never names one that is not offered. */
export function formatLine(): string {
  return `Save ${listWords.format(landingFormatKinds.map((kind) => formatWords[kind]))}. Add files to any of them.`;
}
