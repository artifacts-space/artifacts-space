import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rateLimit from "@/lib/abuse/rate-limit";
import { feedbackMessages } from "@/lib/feedback/feedback-rules";
import type { TeamMembership } from "@/lib/teams/queries";

/*
 * "Something's not working" reports: only signed-in people may send one,
 * the note is checked, five an hour, and nothing is posted unless the
 * webhook is a Slack URL. The session, the rate limit, the team lookup, and
 * fetch (Slack) are mocked at their boundaries; nothing reaches Slack.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  enforceRateLimit: vi.fn(),
  teamForMember: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers({ "user-agent": "Mozilla/5.0 Test" })) }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/queries", () => ({ getTeamForMember: mocks.teamForMember }));
vi.mock("@/lib/abuse/rate-limit", async (importOriginal) => ({ ...(await importOriginal<typeof rateLimit>()), enforceRateLimit: mocks.enforceRateLimit }));

const { sendFeedbackAction } = await import("./feedback-actions");

const webhook = "https://hooks.slack.com/services/T000/B000/fake-test-only";
const input = { note: "The Save button does nothing.", path: "/app?project=secret#x", teamSlug: "acme", viewport: { width: 390, height: 844 } };

/** The JSON body of the one post to Slack. */
function postedBody(): string {
  const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
  return typeof init.body === "string" ? init.body : "";
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("SLACK_FEEDBACK_WEBHOOK_URL", webhook);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.session.mockResolvedValue({ user: { id: "user-1", name: "Avery Example", email: "avery@example.com" } });
  mocks.teamForMember.mockResolvedValue({ slug: "acme", personal: false } satisfies Partial<TeamMembership>);
  mocks.fetch.mockResolvedValue(new Response("ok", { status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendFeedbackAction", () => {
  it("should post one report to the webhook when a signed-in person sends a note", async () => {
    expect(await sendFeedbackAction(input)).toEqual({ success: true, data: null });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("feedbackByUser", "user-1");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(webhook);
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("should send the note, sender, path without query, team, browser, viewport, and deploy when posting", async () => {
    await sendFeedbackAction(input);
    const body = postedBody();
    for (const part of ["The Save button does nothing.", "Avery Example", "avery@example.com", "Page: /app", "Team: acme", "Mozilla/5.0 Test", "390 × 844", "0123456 (preview)"]) {
      expect(body).toContain(part);
    }
    expect(body).not.toContain("secret");
  });

  it("should refuse a signed-out caller and post nothing", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await sendFeedbackAction(input)).toEqual({ success: false, error: feedbackMessages.signedOut });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", { note: "   " }, feedbackMessages.empty],
    ["too long", { note: "x".repeat(2001) }, feedbackMessages.tooLong],
    ["not an object", "hello", feedbackMessages.empty],
  ])("should refuse a note that is %s and post nothing", async (_case, body, message) => {
    expect(await sendFeedbackAction(body)).toEqual({ success: false, error: message });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("should tell the person when they have sent too many reports and post nothing", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new rateLimit.RateLimitError("feedbackByUser", 1800));
    const result = await sendFeedbackAction(input);
    expect(result).toEqual({ success: false, error: "You have sent several problem reports in the last hour. Try again in about 30 minutes." });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["not a Slack URL", "https://example.com/hook"],
  ])("should say feedback is unavailable when the webhook is %s, without counting or posting", async (_case, value) => {
    vi.stubEnv("SLACK_FEEDBACK_WEBHOOK_URL", value);
    expect(await sendFeedbackAction(input)).toEqual({ success: false, error: feedbackMessages.unavailable });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("should ask the person to try again when Slack refuses the post", async () => {
    mocks.fetch.mockResolvedValue(new Response("invalid_payload", { status: 400 }));
    expect(await sendFeedbackAction(input)).toEqual({ success: false, error: feedbackMessages.retry });
  });

  it("should ask the person to try again when Slack does not answer in time", async () => {
    mocks.fetch.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    expect(await sendFeedbackAction(input)).toEqual({ success: false, error: feedbackMessages.retry });
  });

  it("should never log the webhook URL when Slack fails", async () => {
    mocks.fetch.mockRejectedValue(new TypeError(`fetch failed for ${webhook}`));
    await sendFeedbackAction(input);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("hooks.slack.com");
  });

  it("should leave the team out when the person is not a member of it", async () => {
    mocks.teamForMember.mockResolvedValue(null);
    await sendFeedbackAction(input);
    expect(postedBody()).toContain("Team: Personal workspace");
    expect(postedBody()).not.toContain("acme");
  });

  it("should leave the team out when the team lookup fails", async () => {
    mocks.teamForMember.mockRejectedValue(new Error("database down"));
    expect((await sendFeedbackAction(input)).success).toBe(true);
    expect(postedBody()).toContain("Team: Personal workspace");
  });
});
