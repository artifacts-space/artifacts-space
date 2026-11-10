import { describe, expect, it } from "vitest";

import { afterPrologue, detectFileText, detectTextKind, filePlan, fileTitle, headingTitle } from "./detect-kind-rules";

const uiSpec = JSON.stringify({
  version: 1,
  root: "page",
  elements: {
    page: { type: "Stack", props: {}, children: ["title"] },
    title: { type: "Heading", props: { text: "Launch plan", level: 1 } },
  },
});

describe("detectTextKind", () => {
  describe("markdown", () => {
    it("should stay markdown when the text is plain writing", () => {
      expect(detectTextKind("We met on Tuesday and agreed to ship the beta.")).toMatchObject({ kind: "markdown", reason: "prose" });
    });

    it("should stay markdown when the text is empty or only spaces", () => {
      expect(detectTextKind("")).toMatchObject({ kind: "markdown", reason: "empty" });
      expect(detectTextKind("  \n ")).toMatchObject({ kind: "markdown", reason: "empty" });
    });

    it("should keep the content exactly as pasted when it stays markdown", () => {
      const text = "* one\n* two\n\n  trailing  ";
      expect(detectTextKind(text).content).toBe(text);
    });

    it("should name the title and keep the heading line when the first line is a top-level heading", () => {
      const text = "# Launch plan\n\nShip on Friday.";
      expect(detectTextKind(text)).toEqual({ kind: "markdown", language: "", content: text, title: "Launch plan", reason: "heading" });
    });

    it("should not name a title when the first heading is a second-level one", () => {
      expect(detectTextKind("## Notes\n\nSome text.").title).toBeNull();
    });
  });

  describe("misfires that must stay markdown", () => {
    it("should stay markdown when prose has commas on every line", () => {
      expect(detectTextKind("Hi Ann, thanks for the notes.\nSee you soon, Bo.").kind).toBe("markdown");
      expect(detectTextKind("First, we plan. Then, we build.\nAfter that, we ship it.").kind).toBe("markdown");
    });

    it("should stay markdown when one line of prose has commas", () => {
      expect(detectTextKind("Apples, pears, and plums are in season.").kind).toBe("markdown");
    });

    it("should stay markdown when a bulleted list has commas", () => {
      expect(detectTextKind("- apples, pears\n- plums, figs").kind).toBe("markdown");
    });

    it("should stay markdown when a sentence looks like JSON but does not parse", () => {
      expect(detectTextKind("{this is a note to self}").kind).toBe("markdown");
      expect(detectTextKind("[1] See the footnote below.").kind).toBe("markdown");
    });

    it("should stay markdown when a bare number or word would parse as JSON", () => {
      expect(detectTextKind("42").kind).toBe("markdown");
      expect(detectTextKind("true").kind).toBe("markdown");
    });

    it("should stay markdown when a Mermaid word is mid-text", () => {
      expect(detectTextKind("We drew a flowchart of the system.\nIt has three parts.").kind).toBe("markdown");
    });

    it("should stay markdown when a line starts with a Mermaid keyword used as a word", () => {
      expect(detectTextKind("pie is my favourite dessert\nand cake too").kind).toBe("markdown");
      expect(detectTextKind("graph shows growth in Q3\nwith a dip in May").kind).toBe("markdown");
      expect(detectTextKind("timeline for the launch\nis two weeks").kind).toBe("markdown");
    });

    it("should stay markdown when code is pasted without a fence", () => {
      expect(detectTextKind("export function main() {\n  return 1;\n}").kind).toBe("markdown");
      expect(detectTextKind("const a = 1;\nconst b = 2;").kind).toBe("markdown");
    });

    it("should stay markdown when a fence has no language", () => {
      expect(detectTextKind("```\nconst a = 1;\n```").kind).toBe("markdown");
    });

    it("should stay markdown when a document has text around a fenced block", () => {
      expect(detectTextKind("Run this:\n\n```bash\nls\n```").kind).toBe("markdown");
      expect(detectTextKind("```ts\na\n```\n\n```ts\nb\n```").kind).toBe("markdown");
    });

    it("should stay markdown when text only mentions svg", () => {
      expect(detectTextKind("<svg> is a vector format.").kind).toBe("markdown");
    });
  });

  describe("json and ui", () => {
    it("should detect json when the text parses as an object or array", () => {
      expect(detectTextKind('{ "name": "Ada", "age": 36 }')).toMatchObject({ kind: "json", reason: "json" });
      expect(detectTextKind("[1, 2, 3]")).toMatchObject({ kind: "json" });
    });

    it("should detect an interface when the json is a valid interface spec", () => {
      expect(detectTextKind(uiSpec)).toMatchObject({ kind: "ui", reason: "ui" });
    });

    it("should stay json when the object only looks like a spec", () => {
      expect(detectTextKind('{ "root": "page", "elements": {} }').kind).toBe("json");
    });
  });

  describe("csv", () => {
    it("should detect csv when rows have a consistent delimiter", () => {
      expect(detectTextKind("name,value\nAda,1\nBo,2")).toMatchObject({ kind: "csv", reason: "csv" });
    });

    it("should detect csv when the rows are tab-separated, as from a spreadsheet", () => {
      expect(detectTextKind("name\tvalue\nAda\t1\n").kind).toBe("csv");
    });

    it("should detect csv when the rows use semicolons", () => {
      expect(detectTextKind("name;city\nAda;London\nBo;Paris").kind).toBe("csv");
    });

    it("should not detect csv when there is only one row", () => {
      expect(detectTextKind("name,value").kind).toBe("markdown");
    });

    it("should not detect csv when the column counts differ", () => {
      expect(detectTextKind("name,value\nAda,1,extra").kind).toBe("markdown");
    });

    it("should not detect csv when each row has one column", () => {
      expect(detectTextKind("Ada\nBo\nCy").kind).toBe("markdown");
    });

    it("should not detect csv when a header cell is empty", () => {
      expect(detectTextKind(",value\nAda,1").kind).toBe("markdown");
    });
  });

  describe("svg", () => {
    it("should detect svg when the text starts with an svg root", () => {
      expect(detectTextKind('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>').kind).toBe("svg");
    });

    it("should detect svg when an xml prolog and spaces come first", () => {
      expect(detectTextKind('\n  <?xml version="1.0"?>\n<svg viewBox="0 0 1 1"></svg>').kind).toBe("svg");
    });

    it("should finish at once when a paste repeats prologue parts many times", () => {
      const started = performance.now();
      expect(detectTextKind(`<?xml${"?><?xml".repeat(50_000)}`).kind).toBe("markdown");
      expect(detectTextKind(`<!--${"--><!--".repeat(50_000)}`).kind).toBe("markdown");
      expect(performance.now() - started).toBeLessThan(1000);
    });

    it("should stay markdown when the svg never closes", () => {
      expect(detectTextKind("<svg viewBox='0 0 1 1'><rect/>").kind).toBe("markdown");
    });
  });

  describe("mermaid", () => {
    it("should detect mermaid when the text starts with a diagram header", () => {
      expect(detectTextKind("flowchart TD\n  A --> B").kind).toBe("mermaid");
      expect(detectTextKind("sequenceDiagram\n  Ann->>Bo: Hi").kind).toBe("mermaid");
      expect(detectTextKind("graph LR\n  A --> B").kind).toBe("mermaid");
      expect(detectTextKind('pie title Pets\n  "Dogs" : 386').kind).toBe("mermaid");
      expect(detectTextKind("gantt\n  title Plan").kind).toBe("mermaid");
      expect(detectTextKind("erDiagram\n  A ||--o{ B : has").kind).toBe("mermaid");
    });

    it("should not detect mermaid when the header has no diagram under it", () => {
      expect(detectTextKind("flowchart TD").kind).toBe("markdown");
    });
  });

  describe("code", () => {
    it("should detect code with the fence's language when the paste is one fenced block", () => {
      expect(detectTextKind("```ts\nconst a = 1;\nconst b = 2;\n```")).toEqual({ kind: "code", language: "ts", content: "const a = 1;\nconst b = 2;", title: null, reason: "fence" });
    });

    it("should keep the lines inside the fence exactly when it drops the fence lines", () => {
      const body = "def main():\n    return 1\n\n\tindent";
      expect(detectTextKind(`\`\`\`python\n${body}\n\`\`\`\n`).content).toBe(body);
    });

    it("should detect a fenced block with Windows line breaks", () => {
      expect(detectTextKind("```go\r\npackage main\r\n```\r\n")).toMatchObject({ kind: "code", language: "go", content: "package main" });
    });

    it("should detect mermaid when a fenced block is labelled mermaid", () => {
      expect(detectTextKind("```mermaid\nflowchart TD\n  A --> B\n```")).toMatchObject({ kind: "mermaid", content: "flowchart TD\n  A --> B" });
    });

    it("should detect code with the shebang's language when the first line is a shebang", () => {
      expect(detectTextKind("#!/usr/bin/env python3\nprint(1)")).toMatchObject({ kind: "code", language: "python", reason: "shebang" });
      expect(detectTextKind("#!/bin/bash\necho hi")).toMatchObject({ kind: "code", language: "bash" });
      expect(detectTextKind("#!/usr/bin/env -S deno run\nconsole.log(1)")).toMatchObject({ kind: "code", language: "typescript" });
      expect(detectTextKind("#!/usr/bin/env node\nconsole.log(1)")).toMatchObject({ kind: "code", language: "javascript" });
    });

    it("should keep a shebang script exactly as pasted", () => {
      const text = "#!/bin/sh\necho hi\n";
      expect(detectTextKind(text).content).toBe(text);
    });
  });
});

describe("headingTitle", () => {
  it("should read the heading text without closing hashes when the first line is a heading", () => {
    expect(headingTitle("# Plan ##\nbody")).toBe("Plan");
  });

  it("should return null when the first line is not a heading", () => {
    expect(headingTitle("Plan\n# Later")).toBeNull();
    expect(headingTitle("#hashtag")).toBeNull();
  });
});

describe("afterPrologue", () => {
  it("should skip a byte order mark, spaces, an xml declaration, comments, and a doctype", () => {
    const text = '\uFEFF  <?xml version="1.0"?>\n<!-- logo --><!DOCTYPE svg>\n<svg/>';
    expect(text.slice(afterPrologue(text))).toBe("<svg/>");
  });

  it("should stop at a part that never ends", () => {
    expect(afterPrologue("<!-- open")).toBe(0);
  });
});

describe("filePlan", () => {
  it("should read a code file as code with the extension's language", () => {
    expect(filePlan("main.py")).toEqual({ read: true, kind: "code", language: "python" });
    expect(filePlan("src/app.tsx")).toEqual({ read: true, kind: "code", language: "tsx" });
    expect(filePlan("Dockerfile")).toEqual({ read: true, kind: "code", language: "dockerfile" });
  });

  it("should read svg and mermaid files as their formats", () => {
    expect(filePlan("logo.svg")).toEqual({ read: true, kind: "svg", language: "" });
    expect(filePlan("flow.mmd")).toEqual({ read: true, kind: "mermaid", language: "" });
  });

  it("should upload images, documents, and data files as files", () => {
    for (const name of ["photo.png", "report.pdf", "data.csv", "notes.md", "deck.pptx", "README"]) {
      expect(filePlan(name)).toEqual({ read: false });
    }
  });
});

describe("detectFileText", () => {
  it("should title the artifact after the file when a file is read", () => {
    expect(detectFileText("deploy.sh", "echo hi", { read: true, kind: "code", language: "bash" })).toEqual({ kind: "code", language: "bash", content: "echo hi", title: "deploy", reason: "extension" });
  });

  it("should fall back to code when an svg file does not pass the svg checks", () => {
    expect(detectFileText("broken.svg", "<svg>", { read: true, kind: "svg", language: "" })).toMatchObject({ kind: "code", language: "xml" });
  });
});

describe("fileTitle", () => {
  it("should drop the last extension and the folders when it names a file", () => {
    expect(fileTitle("a/b/report.final.pdf")).toBe("report.final");
    expect(fileTitle(".env")).toBe(".env");
  });
});
