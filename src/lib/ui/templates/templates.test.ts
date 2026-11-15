import { describe, expect, it } from "vitest";

import { validateUiSpec } from "../validate";

import { templateFacts } from "./facts";
import { listTemplates, templatesByFile, uiTemplates } from "./index";
import { attachFragment, instantiateTemplate, prefixProblem, templateAsSpec, templatePageKey } from "./instantiate";
import { templateProblems } from "./rules";
import { templateFiles, type UiTemplate } from "./types";

/*
 * The one test that judges every template. It loops over the index, so a
 * template added to a batch file is covered with no test of its own, and
 * every failure names the template.
 */

const filed = templateFiles.flatMap((file) => templatesByFile[file].map((template) => ({ file, template })));
const ids = uiTemplates.map((template) => template.id);

/** The issues of a spec that holds `first`, then `second`, then `first` again under another prefix. */
function mergedIssues(first: UiTemplate, second: UiTemplate): string[] {
  const withSecond = attachFragment(templateAsSpec(first), instantiateTemplate(second, { prefix: first === second ? "other" : undefined }), { parent: templatePageKey });
  const withCopy = attachFragment(withSecond, instantiateTemplate(first, { prefix: "again" }), { parent: templatePageKey });
  return validateUiSpec(withCopy).issues.map((issue) => issue.message);
}

describe("every template", () => {
  it("should keep every template rule when it is in the index", () => {
    const problems = filed.flatMap(({ file, template }) => templateProblems(template, file).map((problem) => `${template.id}: ${problem}`));
    expect(problems).toEqual([]);
  });

  it("should have an id and a name no other template has", () => {
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    const names = uiTemplates.map((template) => template.name);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it("should have an id that is accepted as a prefix, since the id is the prefix when none is passed", () => {
    const refused = uiTemplates.flatMap((template) => {
      const problem = prefixProblem(template.id);
      return problem === null ? [] : [`${template.id}: ${problem}`];
    });
    expect(refused).toEqual([]);
  });

  it("should stay valid, with no issues, when it is drawn under another prefix", () => {
    const issues = uiTemplates.flatMap((template) => validateUiSpec(templateAsSpec(template, { prefix: "other" })).issues.map((issue) => `${template.id}: ${issue.message}`));
    expect(issues).toEqual([]);
  });

  it("should share one valid spec with the next template and with a second copy of itself", () => {
    const issues = uiTemplates.flatMap((template, index) => {
      const next = uiTemplates[(index + 1) % uiTemplates.length] ?? template;
      return mergedIssues(template, next).map((message) => `${template.id} with ${next.id}: ${message}`);
    });
    expect(issues).toEqual([]);
  });

  it("should read and write only state under its prefix once it is instantiated", () => {
    const stray = uiTemplates.flatMap((template) => {
      const instance = instantiateTemplate(template, { prefix: "other" });
      const paths = templateFacts({ ...template, fragment: instance }).statePaths;
      return paths.filter((path) => path !== "/other" && !path.startsWith("/other/")).map((path) => `${template.id}: ${path}`);
    });
    expect(stray).toEqual([]);
  });
});

describe("the template list", () => {
  it("should list every template once, with its element count, when no filter is given", () => {
    const rows = listTemplates();
    expect(rows.map((row) => row.id)).toEqual(ids);
    for (const row of rows) expect(row.elements, row.id).toBeGreaterThan(0);
  });

  it("should list only one category or one kind when a filter is given", () => {
    expect(listTemplates({ category: "pricing" }).every((row) => row.category === "pricing")).toBe(true);
    expect(listTemplates({ category: "pricing" }).length).toBeGreaterThan(0);
    expect(listTemplates({ kind: "marketing" }).every((row) => row.kind === "marketing")).toBe(true);
    expect(listTemplates({ kind: "app", category: "hero" })).toEqual([]);
  });

  it("should keep a row small enough that sixty fit in one result", () => {
    for (const row of listTemplates()) expect(JSON.stringify(row).length, row.id).toBeLessThan(500);
  });
});
