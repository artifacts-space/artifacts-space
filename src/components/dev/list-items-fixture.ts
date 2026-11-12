/**
 * Development only: a document an agent might write, with task items that
 * hold a paragraph, a code block, and another paragraph, numbered items
 * with a code block and with bold text, and a bulleted list in `*` style. The list items e2e
 * test (`e2e/editor-list-items.spec.ts`) loads it at `/dev/editor?kind=lists`.
 */
export const listItemsFixtureMarkdown = [
  "## Record",
  "",
  "- [ ] **1. Connect** (about 20 seconds). Add the plugin.",
  "",
  "- [ ] **2. Save a new artifact in a project.** Paste:",
  "",
  "  ```text",
  "  Save this as an artifact in my Launch project.",
  "  ```",
  "",
  "  Expect: a new private artifact, with a link.",
  "",
  "- [ ] **Show it landed.** Switch to the artifacts.space tab.",
  "",
  "## Set up",
  "",
  "1. Install:",
  "",
  "   ```sh",
  "   pnpm install",
  "   ```",
  "",
  "2. Run it.",
  "3. **Ship** it.",
  "",
  "* one",
  "* two",
  "",
].join("\n");
