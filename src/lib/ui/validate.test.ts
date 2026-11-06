import { describe, expect, it } from "vitest";

import { uiComponentNames } from "./catalog";
import { componentFixtures, fixtureSpec } from "./fixtures/components";
import { exampleUiSpec } from "./fixtures/example";
import { deepJsonText, deepSpec, invalidPropsSpec, javascriptLinkSpec, manyElementsSpec, repeatSpec, unknownTypeSpec } from "./fixtures/specs";
import { formatUiSpecIssues } from "./issues";
import { uiLimits } from "./limits";
import { validateUiSpec } from "./validate";

function codes(input: unknown) {
  return validateUiSpec(input).issues.map((issue) => issue.code);
}

describe("validateUiSpec on valid specs", () => {
  it("should accept the guide example when given as JSON text", () => {
    const result = validateUiSpec(JSON.stringify(exampleUiSpec));
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.renderable).toBe(true);
  });

  it.each(uiComponentNames.flatMap((type) => componentFixtures[type].map((fixture) => [type, fixture.name, fixture] as const)))(
    "should accept the %s fixture %j when validating",
    (type, _name, fixture) => {
      const result = validateUiSpec(fixtureSpec(type, fixture));
      expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    },
  );

  it("should treat null props as absent when normalizing", () => {
    const spec = { version: 1, root: "h", elements: { h: { type: "Heading", props: { text: "Hi", level: null }, children: [] } } };
    expect(validateUiSpec(spec).valid).toBe(true);
  });

  it("should accept a leaf without children when children is omitted", () => {
    expect(validateUiSpec({ version: 1, root: "t", elements: { t: { type: "Text", props: { text: "a" } } } }).valid).toBe(true);
  });

  it("should warn but accept when version is missing", () => {
    const result = validateUiSpec({ root: "t", elements: { t: { type: "Text", props: { text: "a" } } } });
    expect(result.valid).toBe(true);
    expect(result.issues[0]?.code).toBe("missing_version");
  });

  it("should skip schema checks for props that hold expressions", () => {
    const spec = { version: 1, root: "m", state: { v: 3 }, elements: { m: { type: "Metric", props: { label: "Bound", value: { $state: "/v" } } } } };
    expect(validateUiSpec(spec).valid).toBe(true);
  });
});

describe("validateUiSpec on broken specs", () => {
  it("should report invalid JSON with the parser's reason", () => {
    const result = validateUiSpec("{ not json");
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("invalid_json");
  });

  it("should reject a non-object when given an array", () => {
    expect(codes("[]")).toEqual(["not_object"]);
  });

  it("should name the element and list known components when the type is unknown", () => {
    const result = validateUiSpec(unknownTypeSpec);
    const issue = result.issues.find((item) => item.code === "unknown_component");
    expect(issue?.elementKey).toBe("mystery");
    expect(issue?.message).toContain("Heading");
    expect(result.renderable).toBe(true);
  });

  it("should explain that Image is planned when an agent uses it", () => {
    const spec = { version: 1, root: "i", elements: { i: { type: "Image", props: { src: "https://example.com/a.png" } } } };
    expect(codes(spec)).toContain("planned_component");
  });

  it("should name the element and prop when props are invalid", () => {
    const result = validateUiSpec(invalidPropsSpec);
    const messages = result.issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain('Element "broken-chart" (Chart): props.type');
    expect(messages).toContain('Element "broken-metric" (Metric): props.value');
    expect(result.valid).toBe(false);
    expect(result.renderable).toBe(true);
  });

  it("should reject a javascript: link when validating Link props", () => {
    const result = validateUiSpec(javascriptLinkSpec);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toContain("http, https, or mailto");
  });

  it("should reject a chart when series and labels differ in length", () => {
    const spec = { version: 1, root: "c", elements: { c: { type: "Chart", props: { type: "bar", labels: ["a", "b"], series: [{ name: "s", values: [1] }] } } } };
    expect(validateUiSpec(spec).issues[0]?.message).toContain("one value per label");
  });

  it("should reject Tabs when tabs and children counts differ", () => {
    const spec = { version: 1, root: "t", elements: { t: { type: "Tabs", props: { tabs: [{ label: "A" }, { label: "B" }] }, children: ["a"] }, a: { type: "Text", props: { text: "a" } } } };
    expect(codes(spec)).toContain("children_mismatch");
  });

  it("should reject actions that are not state actions", () => {
    const spec = { version: 1, root: "b", elements: { b: { type: "Button", props: { label: "Go" }, on: { press: { action: "fetchData" } } } } };
    expect(codes(spec)).toContain("invalid_action");
  });

  it("should reject events a component does not emit", () => {
    const spec = { version: 1, root: "t", elements: { t: { type: "Text", props: { text: "a" }, on: { press: { action: "setState", params: { statePath: "/a", value: 1 } } } } } };
    expect(codes(spec)).toContain("invalid_event");
  });

  it("should reject watch and $computed when present", () => {
    const spec = { version: 1, root: "t", elements: { t: { type: "Text", props: { text: { $computed: "f" } }, watch: { "/a": { action: "setState" } } } } };
    expect(codes(spec)).toEqual(expect.arrayContaining(["unsupported_field", "unsupported_expression"]));
  });

  it("should report missing children and a missing root when keys are wrong", () => {
    expect(codes({ version: 1, root: "s", elements: { s: { type: "Stack", props: {}, children: ["ghost"] } } })).toContain("missing_child");
    expect(codes({ version: 1, root: "nope", elements: { s: { type: "Text", props: { text: "a" } } } })).toContain("root_not_found");
  });

  it("should reject a version newer than the component set", () => {
    expect(codes({ version: 99, root: "t", elements: { t: { type: "Text", props: { text: "a" } } } })).toContain("unsupported_version");
  });

  it("should format a readable report with errors first", () => {
    const report = formatUiSpecIssues(validateUiSpec(invalidPropsSpec).issues);
    expect(report.split("\n")[0]).toMatch(/^- Error: /);
  });
});

describe("validateUiSpec on hostile specs", () => {
  it("should reject 10,000 elements without walking them all", () => {
    const result = validateUiSpec(manyElementsSpec(10_000));
    expect(result.renderable).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([expect.stringMatching(/too_large|too_many_elements/)]));
  });

  it("should reject more than the element limit when the spec is small enough in bytes", () => {
    expect(codes(manyElementsSpec(uiLimits.maxElements + 1))).toContain("too_many_elements");
  });

  it("should reject element nesting deeper than the limit", () => {
    expect(codes(deepSpec(uiLimits.maxDepth + 1))).toContain("too_deep");
    expect(validateUiSpec(deepSpec(uiLimits.maxDepth)).valid).toBe(true);
  });

  it("should reject deeply nested JSON without overflowing the stack", () => {
    expect(codes(deepJsonText(5000))).toEqual(["too_deep_json"]);
  });

  it("should reject huge strings by size", () => {
    const huge = JSON.stringify({ version: 1, root: "t", elements: { t: { type: "Text", props: { text: "x".repeat(300_000) } } } });
    expect(codes(huge)).toEqual(["too_large"]);
  });

  it("should reject a string prop longer than its limit when the spec is small", () => {
    expect(codes({ version: 1, root: "h", elements: { h: { type: "Heading", props: { text: "x".repeat(201) } } } })).toContain("invalid_props");
  });

  it("should reject prototype keys and paths", () => {
    expect(codes('{"version":1,"root":"t","__proto__":{"x":1},"elements":{"t":{"type":"Text","props":{"text":"a"}}}}')).toEqual(["unsafe_path"]);
    const viaAction = { version: 1, root: "b", elements: { b: { type: "Button", props: { label: "x" }, on: { press: { action: "setState", params: { statePath: "/__proto__/polluted", value: true } } } } } };
    expect(codes(viaAction)).toEqual(["unsafe_path"]);
    expect(codes({ version: 1, root: "t", elements: { t: { type: "Text", props: { text: { $template: "${/constructor/prototype}" } } } } })).toEqual(["unsafe_path"]);
  });

  it("should not flag ordinary words that match prototype names", () => {
    expect(validateUiSpec({ version: 1, root: "t", elements: { t: { type: "Text", props: { text: "The constructor builds a prototype." } } } }).valid).toBe(true);
  });

  it("should reject an element shared by two parents and cycles through the root", () => {
    const shared = { version: 1, root: "a", elements: { a: { type: "Stack", props: {}, children: ["b", "c"] }, b: { type: "Stack", props: {}, children: ["c"] }, c: { type: "Text", props: { text: "x" } } } };
    expect(codes(shared)).toContain("shared_child");
    const cycle = { version: 1, root: "a", elements: { a: { type: "Stack", props: {}, children: ["b"] }, b: { type: "Stack", props: {}, children: ["a"] } } };
    expect(codes(cycle)).toContain("root_is_child");
  });

  it("should reject repeats over more items than the limit", () => {
    expect(validateUiSpec(repeatSpec(uiLimits.maxRepeatItems)).valid).toBe(true);
    expect(codes(repeatSpec(uiLimits.maxRepeatItems + 1))).toContain("repeat_too_long");
  });
});
