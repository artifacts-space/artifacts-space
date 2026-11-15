import { describe, expect, it } from "vitest";

import { readJsonInput, readVersionField, stringifyJson } from "./json-input";
import { validateUiSpec } from "./validate";

const options = { maxBytes: 40, noun: "thing", splitInto: "things", shapeHint: "A thing is one JSON object." };

describe("readJsonInput", () => {
  it("should parse JSON text when it is within the limit", () => {
    expect(readJsonInput('{"a":1}', options)).toEqual({ value: { a: 1 } });
  });

  it("should pass an already-parsed value through unchanged", () => {
    const value = { a: [1, 2] };
    const read = readJsonInput(value, options);
    expect("value" in read && read.value).toBe(value);
  });

  it("should give the parser's reason and the shape when the text is not JSON", () => {
    const read = readJsonInput('{"a":', options);
    expect("issue" in read && read.issue).toMatchObject({ severity: "error", code: "invalid_json" });
    expect("issue" in read && read.issue.message).toMatch(/^The content is not valid JSON: .+\. A thing is one JSON object\.$/);
  });

  it("should refuse an input over the byte limit before parsing it, counting bytes and not characters", () => {
    const read = readJsonInput(`"${"é".repeat(20)}"`, options);
    expect("issue" in read && read.issue).toEqual({ severity: "error", code: "too_large", message: "The thing is 42 bytes; the limit is 40. Split it into several things or trim data." });
    expect("issue" in readJsonInput(`{"broken": ${"x".repeat(60)}`, options) && "too_large").toBe("too_large");
  });

  it("should refuse a value that cannot be written out as JSON", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(readJsonInput(cycle, options)).toEqual({ issue: { severity: "error", code: "invalid_json", message: "The thing could not be read as JSON." } });
    expect(stringifyJson(cycle)).toBeNull();
    expect(stringifyJson(undefined)).toBeNull();
    expect(stringifyJson({ a: 1 })).toBe('{"a":1}');
  });
});

describe("readVersionField", () => {
  it("should read a supported version with no issue", () => {
    expect(readVersionField({ version: 2 }, 3, "so it keeps its meaning")).toEqual({ version: 2 });
  });

  it("should warn and read as current when the version is missing", () => {
    expect(readVersionField({}, 3, "so it keeps its meaning")).toEqual({ version: 3, issue: { severity: "warning", code: "missing_version", message: 'Add "version": 3 at the top level so it keeps its meaning.' } });
  });

  it.each([[4], [0], [1.5], ["1"], [null]])("should refuse version %j when it is not an integer from 1 to the current one", (version) => {
    expect(readVersionField({ version }, 3, "so it keeps its meaning")).toEqual({ version: 3, issue: { severity: "error", code: "unsupported_version", message: '"version" must be an integer from 1 to 3. Use 3.' } });
  });
});

describe("validateUiSpec messages through the shared reader", () => {
  it("should keep the words a ui spec's author sees when its JSON, size, or version is wrong", () => {
    expect(validateUiSpec("{").issues[0]?.message).toMatch(/^The content is not valid JSON: .+\. A ui artifact is one JSON object: \{ "version": 1, "root": "…", "elements": \{ … \} \}\.$/);
    expect(validateUiSpec(`"${"x".repeat(200_000)}"`).issues[0]?.message).toBe("The spec is 200,002 bytes; the limit is 200,000. Split it into several artifacts or trim data.");
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(validateUiSpec(cycle).issues[0]?.message).toBe("The spec could not be read as JSON.");
    const spec = { root: "t", elements: { t: { type: "Text", props: { text: "a" } } } };
    expect(validateUiSpec(spec).issues[0]?.message).toBe('Add "version": 1 at the top level so the spec keeps its meaning as components evolve.');
    expect(validateUiSpec({ ...spec, version: 99 }).issues[0]?.message).toBe('"version" must be an integer from 1 to 1. Use 1.');
  });
});
