import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Who gets a report email: the site operator (ABUSE_REPORT_EMAIL) and nobody
 * else. Team owners never do, even when they are in the database, and an
 * unset or broken address still stores the report.
 */

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  teamRows: [] as unknown[],
  sendEmail: vi.fn(),
  getArtifactAccess: vi.fn(),
}));

function selectChain() {
  const builder: Record<string, unknown> = {};
  for (const name of ["from", "where"]) builder[name] = () => builder;
  builder.limit = () => Promise.resolve(mocks.teamRows);
  return builder;
}

vi.mock("@/db", () => ({ getDb: () => ({ insert: () => ({ values: mocks.insertValues }), select: () => selectChain() }) }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimits: () => Promise.resolve() }));
vi.mock("@/lib/access", () => ({ getArtifactAccess: mocks.getArtifactAccess }));
vi.mock("@/lib/teams/queries", () => ({ findPersonalTeam: () => Promise.resolve(null), getTeamMembershipById: () => Promise.resolve(null) }));
vi.mock("@/lib/sendir", () => ({ isSendirConfigured: () => true, sendEmail: mocks.sendEmail }));
vi.mock("@/lib/email/budget", () => ({ reserveBudgetedEmail: () => Promise.resolve(true) }));

const { submitReport } = await import("./service");

const OPERATOR = "operator@example.com";
const OWNER = "owner@example.com";

function report() {
  return submitReport({ publicId: "pub1", viewerId: null, networkKey: "net-1", report: { reason: "phishing", details: "fake login page" } });
}

function recipients(): string[] {
  return mocks.sendEmail.mock.calls.map((call: unknown[]) => (call[0] as { to: string }).to);
}

describe("submitReport emails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");
    vi.stubEnv("ABUSE_REPORT_EMAIL", OPERATOR);
    // A row that also carries a team owner's email: it must never become a recipient.
    mocks.teamRows = [{ name: "Acme", slug: "acme", id: "owner-1", email: OWNER, role: "owner" }];
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.sendEmail.mockResolvedValue({ data: { id: "sent" }, error: null });
    mocks.getArtifactAccess.mockResolvedValue({
      record: { id: "art-1", publicId: "pub1", visibility: "public", teamId: "team-1", userId: "author-1" },
      served: { title: "Launch plan" },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should email the site operator when a reader reports an artifact", async () => {
    await report();
    expect(recipients()).toEqual([OPERATOR]);
    const [message] = mocks.sendEmail.mock.calls[0] as [{ text: string }];
    expect(message.text).toContain("https://artifacts.space/artifact/pub1");
    expect(message.text).toContain("Acme (acme)");
    expect(message.text).toContain("fake login page");
  });

  it("should not email team owners or anyone else when the operator is emailed", async () => {
    await report();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(recipients()).not.toContain(OWNER);
  });

  it("should store the report and log a warning without emailing anyone when ABUSE_REPORT_EMAIL is unset", async () => {
    vi.stubEnv("ABUSE_REPORT_EMAIL", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(report()).resolves.toEqual({ id: expect.any(String) as string });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ artifactId: "art-1", reason: "phishing", details: "fake login page" }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ABUSE_REPORT_EMAIL is not set"));
  });

  it("should store the report without emailing anyone when ABUSE_REPORT_EMAIL is not an email address", async () => {
    vi.stubEnv("ABUSE_REPORT_EMAIL", "operator");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await report();
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ABUSE_REPORT_EMAIL is not a valid email address"));
  });

  it("should keep the report when the operator email fails to send", async () => {
    mocks.sendEmail.mockResolvedValue({ data: null, error: { statusCode: 500, name: "server_error", message: "down" } });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(report()).resolves.toEqual({ id: expect.any(String) as string });
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[reports] Operator email failed", expect.stringContaining("server_error"));
  });
});
