import { describe, expect, it } from "vitest";

import { isPublicId } from "@/lib/public-id";
import { validateUiSpec } from "@/lib/ui/validate";

import { rolloutContent, rolloutSession } from "./rollout-session";

describe("landing rollout session", () => {
  it("should render the rollout spec with no issues when validated as a ui artifact", () => {
    const result = validateUiSpec(rolloutContent);
    expect(result.renderable).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("should use a real public id when the terminal shows the artifact", () => {
    expect(isPublicId(rolloutSession.artifactId)).toBe(true);
  });

  it("should use a uuid when the terminal shows a comment id", () => {
    expect(rolloutSession.reviewCommentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("should mention the agent when the reviewer comments", () => {
    expect(rolloutSession.reviewComment.startsWith(`@${rolloutSession.agentHandle} `)).toBe(true);
    expect(rolloutSession.askForReview.startsWith(`@${rolloutSession.reviewerHandle} `)).toBe(true);
  });
});
