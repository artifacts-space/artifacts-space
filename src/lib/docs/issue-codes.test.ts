import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { issueCodeDocs } from "./issue-codes";

const uiDir = join(process.cwd(), "src/lib/ui");
const codePattern = /spec(Error|Warning)\("([a-z_]+)"/g;

/** Every code the ui validator sources pass to specError or specWarning. */
function codesInValidator(): Map<string, "error" | "warning"> {
  const codes = new Map<string, "error" | "warning">();
  for (const file of readdirSync(uiDir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
    for (const match of readFileSync(join(uiDir, file), "utf8").matchAll(codePattern)) {
      codes.set(match[2] ?? "", match[1] === "Error" ? "error" : "warning");
    }
  }
  return codes;
}

describe("issueCodeDocs", () => {
  it("should document every code the validator reports with its severity when the validator changes", () => {
    const documented = new Map(issueCodeDocs.map((item) => [item.code, item.severity]));
    for (const [code, severity] of codesInValidator()) {
      expect(documented.get(code), code).toBe(severity);
    }
  });

  it("should give every documented code a meaning when the table renders", () => {
    for (const item of issueCodeDocs) expect(item.meaning, item.code).not.toBe("");
  });
});
