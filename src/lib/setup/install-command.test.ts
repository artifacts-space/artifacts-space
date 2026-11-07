import { describe, expect, it } from "vitest";

import { SKILL_INSTALL_COMMAND, SKILLS_REPO } from "./install-command";

describe("SKILL_INSTALL_COMMAND", () => {
  it("should add the skill from the artifacts-space/skills repo when run with the skills CLI", () => {
    expect(SKILLS_REPO).toBe("artifacts-space/skills");
    expect(SKILL_INSTALL_COMMAND).toBe("npx skills add artifacts-space/skills");
  });

  it("should install into the project when copied as shown", () => {
    expect(SKILL_INSTALL_COMMAND).not.toMatch(/\s(-g|--global)\b/);
  });
});
