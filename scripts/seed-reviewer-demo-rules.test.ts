import { describe, expect, it } from "vitest";

import { apiSpec, apiSpecComment, databaseStep, demoTitles, launchTimeline, onboardingArtifacts, parseSeedArgs, releaseChecklist, roadmapVersions, seedReport, type SeedCounts } from "./seed-reviewer-demo-rules.mts";
import { sampleArtifacts } from "./create-reviewer-account-rules.mts";

const counts: SeedCounts = { removedArtifacts: 10, removedProjects: 1, removedInboxEntries: 1, removedNotifications: 1, createdArtifacts: 10, createdVersions: 2, createdComments: 1 };

describe("parseSeedArgs", () => {
  it("should read both addresses in lowercase and the reset flag when they are given", () => {
    expect(parseSeedArgs(["--email", " Rev@Artifacts.Space ", "--commenter-email", "other@artifacts.space", "--reset"])).toEqual({
      ok: true,
      request: { email: "rev@artifacts.space", commenterEmail: "other@artifacts.space", reset: true },
    });
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

describe("seedReport", () => {
  it("should count what was removed and created when the run seeded", () => {
    expect(seedReport(counts, false)).toBe("Removed 10 artifacts, 1 project, 1 inbox entry, and 1 notification. Created 10 artifacts, 2 later versions, and 1 comment.");
  });

  it("should say nothing was created when the account already holds the demo data", () => {
    expect(seedReport({ ...counts, removedArtifacts: 0, removedProjects: 0, removedInboxEntries: 0, removedNotifications: 0 }, true)).toContain("nothing was created");
  });
});
