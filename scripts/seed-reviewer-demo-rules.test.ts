import { describe, expect, it } from "vitest";

import {
  apiSpec,
  apiSpecComment,
  databaseStep,
  demoTitles,
  launchTimeline,
  leftoverRefusal,
  onboardingArtifacts,
  otherArtifactCount,
  parseSeedArgs,
  partlySeededRefusal,
  releaseChecklist,
  removalNotice,
  roadmapVersions,
  seededTitles,
  seedReport,
  seedUsage,
  type SeedCounts,
} from "./seed-reviewer-demo-rules.mts";
import { sampleArtifacts } from "./create-reviewer-account-rules.mts";

const counts: SeedCounts = { removedArtifacts: 10, removedProjects: 1, removedInboxEntries: 1, removedNotifications: 1, createdArtifacts: 10, createdVersions: 2, createdComments: 1 };

describe("parseSeedArgs", () => {
  it("should read both addresses in lowercase and the reset flag when they are given", () => {
    expect(parseSeedArgs(["--email", " Rev@Artifacts.Space ", "--commenter-email", "other@artifacts.space", "--reset"])).toEqual({
      ok: true,
      request: { email: "rev@artifacts.space", commenterEmail: "other@artifacts.space", reset: true, preview: false },
    });
  });

  it("should take --preview only together with --reset", () => {
    const both = ["--email", "rev@artifacts.space", "--commenter-email", "other@artifacts.space", "--reset", "--preview"];
    expect(parseSeedArgs(both)).toMatchObject({ ok: true, request: { reset: true, preview: true } });
    expect(parseSeedArgs(both.filter((flag) => flag !== "--reset"))).toMatchObject({ ok: false });
  });

  it("should refuse when the commenter is the reviewer", () => {
    expect(parseSeedArgs(["--email", "rev@artifacts.space", "--commenter-email", "REV@artifacts.space"])).toMatchObject({ ok: false });
  });

  it("should refuse when an address is missing or an unknown flag is passed", () => {
    expect(parseSeedArgs(["--email", "rev@artifacts.space"])).toMatchObject({ ok: false });
    expect(parseSeedArgs(["--email", "rev@artifacts.space", "--commenter-email", "o@artifacts.space", "--force"])).toMatchObject({ ok: false });
  });
});

describe("demo content", () => {
  it("should leave exactly one unchecked step, the database step, when the release checklist is seeded", () => {
    expect(releaseChecklist.content.split("\n").filter((line) => line.startsWith("- [ ]"))).toEqual([databaseStep]);
  });

  it("should mention onboarding only in the onboarding artifacts when a search for it runs", () => {
    const others = [launchTimeline, releaseChecklist, apiSpec, ...sampleArtifacts, { title: "Q4 roadmap", summary: "", content: roadmapVersions.join("\n") }];
    expect(onboardingArtifacts.every((item) => item.title.startsWith("Onboarding"))).toBe(true);
    expect(others.filter((item) => /onboarding/i.test(`${item.title} ${item.summary} ${item.content}`))).toEqual([]);
  });

  it("should give every roadmap version different content when the history is listed", () => {
    expect(new Set(roadmapVersions).size).toBe(3);
  });

  it("should use titles no sample artifact uses when demo data is detected", () => {
    expect(sampleArtifacts.filter((sample) => demoTitles.includes(sample.title))).toEqual([]);
  });

  it("should mention the reviewer by handle when the API spec comment is written", () => {
    expect(apiSpecComment("rev-one")).toMatch(/^@rev-one /);
  });
});

describe("seededTitles", () => {
  it("should say none when the account holds no demo title, whatever else it holds", () => {
    expect(seededTitles(new Set(["Welcome", "My own notes"]))).toEqual({ state: "none" });
  });

  it("should say all only when every demo title is there", () => {
    expect(seededTitles(new Set([...demoTitles, "Extra"]))).toEqual({ state: "all" });
  });

  it("should name what is there and what is missing when one hand-made title matches", () => {
    const held = seededTitles(new Set(["API spec"]));

    expect(held).toMatchObject({ state: "some", has: ["API spec"] });
    expect(held.state === "some" ? held.missing : []).toEqual(demoTitles.filter((title) => title !== "API spec"));
  });
});

describe("reset wording", () => {
  it("should say a reset removes everything the account owns when the usage is printed", () => {
    expect(seedUsage).toContain("EVERYTHING the account owns");
    expect(seedUsage).toContain("There is no prompt");
  });

  it("should count what will go, and how much of it is not demo data, when a reset starts", () => {
    expect(removalNotice({ artifacts: 11, otherArtifacts: 1, projects: 1 }, false)).toBe("Reset: removing everything this account owns (11 artifacts, 1 of them not demo data, and 1 project), then its inbox and notifications.");
    expect(removalNotice({ artifacts: 1, otherArtifacts: 0, projects: 0 }, false)).toContain("(1 artifact, all of them demo data, and 0 projects)");
  });

  it("should say nothing was removed when the reset is only a preview", () => {
    const line = removalNotice({ artifacts: 11, otherArtifacts: 1, projects: 1 }, true);

    expect(line).toMatch(/^Preview: a reset would remove everything this account owns \(11 artifacts, 1 of them not demo data, and 1 project\)/);
    expect(line).toContain("Nothing was removed or created.");
  });

  it("should count as not demo data every title that is neither a demo title nor a sample", () => {
    expect(otherArtifactCount([...demoTitles, ...sampleArtifacts.map((sample) => sample.title)])).toBe(0);
    expect(otherArtifactCount(["Launch plan", "API spec", "My own notes"])).toBe(2);
  });

  it("should say how far a stopped reset got and that nothing was seeded", () => {
    expect(leftoverRefusal(3, 10)).toContain("3 of 10");
    expect(leftoverRefusal(3, 10)).toContain("Nothing was seeded");
  });

  it("should name the titles and point to --reset when the account is partly seeded", () => {
    expect(partlySeededRefusal(["API spec"], ["Q4 roadmap"])).toBe('The account holds only part of the demo data, so nothing was created. It has "API spec" and lacks "Q4 roadmap". Run with --reset to remove everything the account owns and seed it again.');
  });
});

describe("seedReport", () => {
  it("should count what was removed and created when the run seeded", () => {
    expect(seedReport(counts, false)).toBe("Removed 10 artifacts, 1 project, 1 inbox entry, and 1 notification. Created 10 artifacts, 2 later versions, and 1 comment.");
  });

  it("should say nothing was created when the account already holds the demo data", () => {
    expect(seedReport({ ...counts, removedArtifacts: 0, removedProjects: 0, removedInboxEntries: 0, removedNotifications: 0 }, true)).toContain("nothing was created");
  });
});
