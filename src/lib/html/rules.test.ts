import { describe, expect, it } from "vitest";

import { htmlProblem, htmlStarter, htmlText, htmlTitle, looksLikeHtmlPage } from "./rules";

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
