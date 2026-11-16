import { describe, expect, it } from "vitest";

import { htmlProblem, htmlStarter, htmlText, htmlTitle, looksLikeHtmlPage, showsAuthorNote } from "./rules";

describe("htmlProblem", () => {
  it("should accept a page that starts with the doctype, in any case, after white space or a byte order mark", () => {
    expect(htmlProblem("<!doctype html><html><body>Hi</body></html>")).toBeNull();
    expect(htmlProblem("﻿\n  <!DOCTYPE HTML>\n<html></html>")).toBeNull();
    expect(htmlProblem(htmlStarter)).toBeNull();
  });

  it.each(["<div>Hi</div>", "<html><body>Hi</body></html>", "# Title", "<!doctype htmlx>", "<!-- note --><!doctype html>", "<?xml version=\"1.0\"?><svg></svg>"])("should refuse %s and say how a page starts", (content) => {
    expect(htmlProblem(content)).toContain("must start with <!doctype html>");
    expect(looksLikeHtmlPage(content)).toBe(false);
  });
});

describe("htmlText", () => {
  it("should give the words on the page without scripts, styles, comments, or tags", () => {
    const page = `<!doctype html><html><head><title>Plan</title><style>p { color: red; }</style></head>
      <body><h1>Launch&nbsp;plan</h1><!-- draft --><p>Ship on <b>Friday</b> &amp; rest.</p><script>alert("x < y")</script></body></html>`;
    expect(htmlText(page)).toBe("Launch plan Ship on Friday & rest.");
  });

  it("should read a page whose script or tag never closes without running long", () => {
    expect(htmlText("<!doctype html><body><p>Start</p><script>var a = 1;")).toBe("Start");
    expect(htmlText("<!doctype html><body><p>Start</p><div class=")).toBe("Start");
  });

  it("should decode numbered entities and leave unknown names as written", () => {
    expect(htmlText("<body>&#65;&#x42; &unknown; &lt;b&gt;</body>")).toBe("AB &unknown; <b>");
  });
});

describe("htmlTitle", () => {
  it("should give the page's own title, on one line", () => {
    expect(htmlTitle("<!doctype html><title>\n  Q3 &amp; Q4\n</title>")).toBe("Q3 & Q4");
    expect(htmlTitle("<!doctype html><body>No title</body>")).toBe("");
  });
});

describe("htmlText with odd closing tags", () => {
  it("should leave out a script whose closing tag has spaces, attributes, or capitals", () => {
    expect(htmlText("<body><p>One</p><SCRIPT>a()</script ><p>Two</p><script>b()</script\t\n bar><p>Three</p></body>")).toBe("One Two Three");
  });

  it("should leave out a comment that ends the lenient way", () => {
    expect(htmlText("<body>One<!-- hidden --!>Two</body>")).toBe("One Two");
  });
});

describe("showsAuthorNote", () => {
  it("should show the note to a reader who cannot edit an HTML page shared by link or with everyone", () => {
    expect(showsAuthorNote({ kind: "html", canEdit: false, visibility: "link" })).toBe(true);
    expect(showsAuthorNote({ kind: "html", canEdit: false, visibility: "public" })).toBe(true);
  });

  it("should not show it to an editor, on a page kept in the team, or on another format", () => {
    expect(showsAuthorNote({ kind: "html", canEdit: true, visibility: "public" })).toBe(false);
    expect(showsAuthorNote({ kind: "html", canEdit: false, visibility: "team" })).toBe(false);
    expect(showsAuthorNote({ kind: "markdown", canEdit: false, visibility: "public" })).toBe(false);
  });
});

describe("reading a page with a large head", () => {
  const style = `<style>${".a{color:red}".repeat(8_000)}</style>`;
  const page = `<!doctype html><html><head>${style}<title>Quarterly review</title></head><body><h1>Revenue grew</h1></body></html>`;

  it("should still give the page's words when an inline stylesheet is longer than the scan budget", () => {
    expect(style.length).toBeGreaterThan(60_000);
    expect(htmlText(page)).toBe("Revenue grew");
  });

  it("should still find a title that sits after the stylesheet", () => {
    expect(htmlTitle(page)).toBe("Quarterly review");
  });

  it("should read the words of a page without a body tag, after its head", () => {
    expect(htmlText(`<!doctype html><head>${style}</head><p>No body tag</p>`)).toBe("No body tag");
  });

  it("should not take a body tag written inside the head for the body", () => {
    const tricky = '<!doctype html><html><head><script>const tpl = "<body class=card>secret()";</script><!-- <body> --></head><body><p>Real words</p></body></html>';
    expect(htmlText(tricky)).toBe("Real words");
    expect(htmlText('<!doctype html><head><script>const a = "<body>x";</script></head><p>No body tag</p>')).toBe("No body tag");
  });

  it("should never take a title from the body", () => {
    expect(htmlTitle("<!doctype html><head></head><body><svg><title>Chart</title></svg></body>")).toBe("");
  });
});

describe("reading a page written to be slow", () => {
  const within = (run: () => unknown) => {
    const started = performance.now();
    run();
    return performance.now() - started;
  };

  it.each([
    ["a body tag that never closes, a million characters of it", "<body".repeat(200_000)],
    ["a title tag that never closes", "<title".repeat(160_000)],
    ["a head end that never closes", "</head".repeat(160_000)],
    ["a comment that never closes", `<body>${"<!--".repeat(250_000)}`],
    ["a script that never closes", `<body>${"<script>".repeat(120_000)}`],
    ["a script whose end tag never closes", `<body><script>${"</script".repeat(120_000)}`],
    ["tags that never close", `<body>${"<p".repeat(400_000)}`],
  ])("should read %s in one pass", (_name, body) => {
    const page = `<!doctype html>${body}`;
    // One pass takes a few milliseconds; a pattern that retries from each place takes minutes at this size. The
    // limit sits far from both, so a loaded machine does not fail it.
    expect(within(() => { htmlText(page); htmlTitle(page); })).toBeLessThan(5_000);
  }, 60_000);
});
