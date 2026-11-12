/**
 * The round-trip corpus: Markdown samples for every block the editor knows,
 * grouped by block. markdown-roundtrip.test.ts loads each sample into the
 * editor model and checks that it comes back byte for byte, and that
 * rendering it fresh keeps its meaning. A new block plugs in by adding an
 * entry here (see markdown-dialect.md, "Adding a block").
 */

/** One block's samples, and what the editor should make of them. */
export interface BlockSamples {
  /** The editor node every sample must produce at least one of. */
  node: string;
  /** True when the samples load as formatted blocks, with no raw block. */
  rich: boolean;
  samples: Readonly<Record<string, string>>;
}

const fileA = "0f8fad5b-d9cb-469f-a165-70867728950e";
const fileB = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

/** Every block, by name. */
export const blockCorpus: Readonly<Record<string, BlockSamples>> = {
  heading: { node: "heading", rich: true, samples: { headings: "# Plan\n\nSome intro text.\n\n## Steps\n\n### Detail\n", setextHeading: "Title\n=====\n", crlf: "# Title\r\n\r\nBody\r\n" } },
  paragraph: {
    node: "paragraph",
    rich: true,
    samples: {
      emphasis: "This has **bold**, _italic_, *star italic*, __under bold__, ~~strike~~, and `code`.\n",
      links: "Read [the docs](https://example.com/docs) or mail [us](mailto:team@example.com).\n",
      hardBreak: "Line one  \nLine two\n",
      noTrailingNewline: "Just a line",
      entities: "Tom &amp; Jerry \\*not em\\* <https://x.com> and https://y.com\n",
      extraBlankLines: "First\n\n\n\nSecond\n",
      fileLink: `Download [the deck](/api/files/${fileA}) before Friday.\n`,
    },
  },
  bulletList: { node: "bulletList", rich: true, samples: { bulletList: "- one\n- two\n- three\n", starList: "* one\n* two\n", nestedList: "- parent\n  - child\n    - grandchild\n- sibling\n" } },
  orderedList: { node: "orderedList", rich: true, samples: { orderedList: "1. first\n2. second\n3. third\n", mixedNested: "1. step\n   - note\n   - other\n2. next\n" } },
  taskList: { node: "taskList", rich: true, samples: { taskList: "- [ ] todo\n- [x] done\n", taskListNoNewline: "- [ ] todo\n- [x] done" } },
  codeBlock: {
    node: "codeBlock",
    rich: true,
    samples: {
      fencedCode: "```ts\nconst answer: number = 42;\nconsole.log(answer);\n```\n",
      fencedNoLang: "```\nplain block\n```\n",
      indentedCode: "    indented code\n",
      codeCaption: "```ts {caption=\"The answer, typed\"}\nconst answer: number = 42;\n```\n",
      codeWrap: "```text {wrap=true}\nA long line of output that wraps instead of scrolling sideways.\n```\n",
      codeCaptionBacktick: "~~~sh {caption=\"Run `pnpm check` first\"}\npnpm check\n~~~\n",
      codeInfoWords: "```js title=\"app.js\"\nlet x;\n```\n",
    },
  },
  mermaid: {
    node: "codeBlock",
    rich: true,
    samples: {
      mermaidFlowchart: "Intro.\n\n```mermaid\nflowchart TD\n  A[Agent writes] --> B{Reviewed?}\n  B -->|Yes| C[Publish]\n  B -->|No| A\n```\n\nOutro.\n",
      mermaidSequence: "```mermaid\nsequenceDiagram\n  participant P as Person\n  P->>Agent: Draft the plan\n  Agent-->>P: Here it is\n```\n",
      mermaidFrontMatter: "```mermaid\n---\ntitle: Release\n---\n%% stages\ngantt\n  dateFormat YYYY-MM-DD\n  Build :a1, 2026-11-01, 3d\n```\n",
      mermaidTilde: "~~~mermaid\npie\n  \"Docs\" : 3\n  \"Code\" : 5\n~~~\n",
      mermaidBroken: "```mermaid\nflowchart TD\n  A -- > B\n```\n",
      mermaidInQuote: "> ```mermaid\n> graph LR\n>   A --> B\n> ```\n",
      mermaidViewCode: "```mermaid {view=code}\nflowchart LR\n  A --> B\n```\n",
      mermaidViewPreview: "```mermaid {view=preview}\nflowchart LR\n  A --> B\n```\n",
      mermaidViewSplit: "```mermaid {view=split}\nflowchart LR\n  A --> B\n```\n",
      mermaidCaption: "```mermaid {caption=\"How a change ships\"}\nflowchart LR\n  Draft --> Ship\n```\n",
      mermaidSplitCaption: "Intro.\n\n```mermaid {view=split caption=\"Say \\\"ship\\\" at C:\\\\\"}\nflowchart LR\n  A --> B\n```\n\nOutro.\n",
      mermaidUnknownAttribute: "```mermaid {view=sideways zoom=2}\nflowchart LR\n  A --> B\n```\n",
    },
  },
  blockquote: { node: "blockquote", rich: true, samples: { quote: "> Quoted text\n> continues here.\n", quoteWithList: "> quote\n>\n> - list in quote\n" } },
  horizontalRule: { node: "horizontalRule", rich: true, samples: { rule: "Above\n\n---\n\nBelow\n" } },
  table: { node: "table", rich: true, samples: { table: "| Name | Role |\n| --- | --- |\n| Ada | Lead |\n| Lin | Dev |\n", alignedTable: "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n" } },
  media: {
    node: "media",
    rich: true,
    samples: {
      image: `![Release diagram](/api/files/${fileA})\n`,
      imageCaption: `Intro.\n\n![Chart of Q3 revenue](/api/files/${fileA} "Revenue grew 12% in Q3")\n\nOutro.\n`,
      imageWidth: `![Logo](/api/files/${fileA}#width=40)\n`,
      imageNoAlt: `![](/api/files/${fileA})`,
      imageEscapes: `![A \\[draft\\] of \\*the\\* plan](/api/files/${fileA} "Say \\"hi\\"")\n`,
      imageUppercaseId: `![Plan](/api/files/${fileA.toUpperCase()})\n`,
      singleQuotedTitle: `![Plan](/api/files/${fileA} 'Caption')\n`,
      video: `![Product walkthrough](/api/files/${fileB}#video&width=80 "Two minutes")\n`,
      audio: `![Customer interview](/api/files/${fileB}#audio)\n`,
      pdf: `![Q3 report](/api/files/${fileB}#pdf "Board version")\n`,
      file: `![budget.xlsx](/api/files/${fileB}#file)\n`,
      inQuote: `> ![Quoted chart](/api/files/${fileA})\n`,
      twoInARow: `![One](/api/files/${fileA})\n\n![Two](/api/files/${fileB}#width=50)\n`,
      externalImage: "![Diagram](https://example.com/d.png)\n",
      externalSpaces: "![Diagram](<https://example.com/a b.png> \"Spaced\")\n",
    },
  },
  blockColors: {
    node: "paragraph",
    rich: true,
    samples: {
      colorText: "Plain line.\n\nA red line <!-- color: red -->\n",
      colorBoth: "Read this first <!-- color: red; background: yellow -->\n",
      colorBackgroundOnly: "Shaded line <!-- background: gray -->\n",
      colorHeading: "## Status <!-- background: green -->\n\nBody.\n",
      colorListItem: "- one <!-- color: blue -->\n- two\n",
      colorTaskItem: "- [ ] call back <!-- color: purple -->\n- [x] done\n",
      colorInQuote: "> Quoted line <!-- background: pink -->\n",
      colorTwoLines: "First line\nsecond line <!-- color: brown -->\n",
      colorAfterBold: "Ends in **bold** <!-- color: orange -->\n",
      colorUnknownHue: "Teal is not a hue <!-- color: teal -->\n",
      colorLoose: "Loose spacing <!--background:blue;color:green-->\n",
    },
  },
  rawMarkdown: {
    node: "rawMarkdown",
    rich: false,
    samples: {
      rawHtml: "Intro\n\n<details>\n<summary>More</summary>\n\nHidden\n\n</details>\n\nOutro\n",
      inlineHtml: "Press <kbd>Ctrl</kbd> to continue.\n",
      footnotes: "A claim.[^1]\n\n[^1]: The source.\n",
      referenceLink: "See [docs][ref].\n\n[ref]: https://example.com\n",
      imageInText: `See ![the chart](/api/files/${fileA}) here.\n`,
      imageThenText: `![Chart](/api/files/${fileA})\nA line right under it.\n`,
      imageFormattedAlt: `![A *bold* claim](/api/files/${fileA})\n`,
      imageUnknownOption: `![Chart](/api/files/${fileA}#poster)\n`,
      imageQuery: `![Chart](/api/files/${fileA}?download=1)\n`,
      imageRelativePath: "![Chart](./chart.png)\n",
      imageInList: `- ![Chart](/api/files/${fileA})\n`,
      otherComment: "A note <!-- TODO: check this -->\n",
      colorMidText: "Red <!-- color: red --> then more text\n",
    },
  },
};
