import { describe, expect, it } from "vitest";

import { artifactLinkNote, artifactToolCopy, SERVER_INSTRUCTIONS } from "./routing-copy";
import { READ_ONLY_INSTRUCTIONS } from "./tool-access";

/*
 * Claude Code defers MCP tools behind a keyword search over their names and
 * descriptions, and loads server instructions at the start of every session.
 * It cuts instructions after 4,096 characters, and a search reads only the
 * start of a description. These tests keep the words people use near the
 * start, and keep the copy honest: it explains what the tool does and never
 * claims authority over the agent's other instructions.
 */

const CLAUDE_CODE_INSTRUCTIONS_LIMIT = 4096;
const everydayWords = ["artifact", "doc", "plan", "spec", "report", "page", "dashboard", "notes", "save", "share", "publish", "write something up", "keep"];
const authorityClaims = /\b(ignore|disregard|override|supersede|system prompt|always use|must use|never use)\b|instead of (any|your|the) (built-in|other)/i;

describe("SERVER_INSTRUCTIONS", () => {
  it("should fit within Claude Code's instructions limit when it loads at session start", () => {
    expect(SERVER_INSTRUCTIONS.length).toBeLessThan(CLAUDE_CODE_INSTRUCTIONS_LIMIT);
  });

  it("should still fit when a read-only connection gets the read-only note after it", () => {
    // src/app/api/mcp/route.ts sends exactly this string to read-only connections.
    expect(`${SERVER_INSTRUCTIONS} ${READ_ONLY_INSTRUCTIONS}`.length).toBeLessThan(CLAUDE_CODE_INSTRUCTIONS_LIMIT);
  });

  it("should still fit with the link note and the read-only note, as the server sends them, for a long origin", () => {
    // src/app/api/mcp/route.ts sends the instructions, then the link note with the site's origin, then the read-only note.
    const note = artifactLinkNote(`https://${"a".repeat(63)}.${"b".repeat(63)}.example`);
    expect(`${SERVER_INSTRUCTIONS} ${note} ${READ_ONLY_INSTRUCTIONS}`.length).toBeLessThan(CLAUDE_CODE_INSTRUCTIONS_LIMIT);
  });

  it("should say what an artifact's link looks like on this deployment, and which tool reads one, when someone hands an agent a link", () => {
    const note = artifactLinkNote("https://artifacts.example");
    expect(note).toContain("https://artifacts.example/artifact/<22 characters>");
    expect(note).toContain("artifacts_get");
    expect(note).toMatch(/takes its link as well as its id/);
    expect(note).not.toMatch(authorityClaims);
  });

  it("should name the everyday words for artifacts in its first 600 characters when an agent decides what to search for", () => {
    const opening = SERVER_INSTRUCTIONS.slice(0, 600).toLowerCase();
    for (const word of everydayWords) expect(opening, word).toContain(word);
  });

  it("should say why artifacts.space fits when it describes saved artifacts", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/persist across sessions/);
    expect(SERVER_INSTRUCTIONS).toMatch(/shared with a team/);
    expect(SERVER_INSTRUCTIONS).toMatch(/both people and agents/);
    expect(SERVER_INSTRUCTIONS).toMatch(/every version/);
  });

  it("should leave quick answers and repository files out when it says what to save", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/quick questions in chat/);
    expect(SERVER_INSTRUCTIONS).toMatch(/README, in the repository/);
  });

  it("should not claim authority over the agent's other instructions when it is read as context", () => {
    expect(SERVER_INSTRUCTIONS).not.toMatch(authorityClaims);
  });
});

describe("artifactToolCopy", () => {
  it("should put the everyday words in the first 250 characters of artifacts_create when tool search matches them", () => {
    const opening = artifactToolCopy.artifacts_create.description.slice(0, 250).toLowerCase();
    for (const word of ["doc", "plan", "spec", "report", "notes", "page", "dashboard", "artifact", "write something up", "save", "keep", "share", "publish"]) {
      expect(opening, word).toContain(word);
    }
  });

  it("should name the kinds of saved work at the start of the list, get, and update descriptions when an agent searches for earlier work", () => {
    for (const tool of ["artifacts_list", "artifacts_get", "artifacts_update"] as const) {
      const opening = artifactToolCopy[tool].description.slice(0, 120);
      expect(opening, tool).toMatch(/doc/);
      expect(opening, tool).toMatch(/plan/);
      expect(opening, tool).toMatch(/report/);
    }
  });

  it("should explain why artifacts_create fits when an agent compares it with other tools", () => {
    const { description } = artifactToolCopy.artifacts_create;
    expect(description).toMatch(/persists across sessions/);
    expect(description).toMatch(/people and agents can both read and edit it/);
    expect(description).toMatch(/shared with a team or by link/);
    expect(description).toMatch(/version history/);
  });

  it("should send visual and interactive work to an HTML page, and to its guide first, when an agent is asked for a mockup or a dashboard", () => {
    const { description } = artifactToolCopy.artifacts_create;
    expect(description).toMatch(/a mockup of a website or of app screens, a prototype, a dashboard, a report with charts\), set kind "html"/);
    expect(description).toMatch(/read artifacts_formats_guide with kind "html" first/);
  });

  it("should no longer point new work at the canvas or interface formats when an agent creates an artifact", () => {
    const { description } = artifactToolCopy.artifacts_create;
    expect(description).not.toMatch(/kind "canvas"/);
    expect(description).not.toMatch(/kind "ui"/);
  });

  it("should still point at the frame tools for a canvas that exists, so an agent changes one screen without resending the board", () => {
    expect(artifactToolCopy.artifacts_update.description).toMatch(/To change one frame of a canvas, use canvas_frame_save, canvas_frame_update, or canvas_frame_delete/);
  });

  it("should not claim authority in any description when tools are listed", () => {
    for (const [name, copy] of Object.entries(artifactToolCopy)) expect(copy.description, name).not.toMatch(authorityClaims);
  });

  it("should say artifacts_get reads a link as well as an id, and that a search takes one, when an agent holds an artifact's link", () => {
    expect(artifactToolCopy.artifacts_get.description).toMatch(/by its id or its link\. The link ends in \/artifact\/ and the 22-character id/);
    expect(artifactToolCopy.artifacts_list.description).toMatch(/A `query` that is an artifact's id or link returns that artifact first/);
  });
});
