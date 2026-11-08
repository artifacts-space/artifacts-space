import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewableArtifact } from "@/lib/access";
import type * as AuthenticateModule from "@/lib/mcp/authenticate";
import type { ArtifactVisibility, CommentSetting } from "@/lib/artifact-types";
import { UserFacingError } from "@/lib/user-facing-error";

const mocks = vi.hoisted(() => ({
  getViewableArtifact: vi.fn(),
  authenticateMcpRequest: vi.fn(),
  getSession: vi.fn(),
  hitRateLimits: vi.fn(),
  listComments: vi.fn(),
  filesForViewer: vi.fn(),
  loadArtifactByline: vi.fn(),
  lastEditorsFor: vi.fn(),
  versionCount: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ getViewableArtifact: mocks.getViewableArtifact }));
vi.mock("@/lib/mcp/authenticate", async (importOriginal) => ({ ...(await importOriginal<typeof AuthenticateModule>()), authenticateMcpRequest: mocks.authenticateMcpRequest }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimits: mocks.hitRateLimits, rateLimitMessage: () => "Your network has opened a lot of artifact pages in the last hour. Try again in about 5 minutes." }));
vi.mock("@/lib/comments/service", () => ({ listComments: mocks.listComments }));
vi.mock("@/lib/files/download", () => ({ filesForViewer: mocks.filesForViewer }));
vi.mock("@/lib/artifact-byline", () => ({ loadArtifactByline: mocks.loadArtifactByline }));
vi.mock("@/lib/artifacts", () => ({ lastEditorsFor: mocks.lastEditorsFor }));
vi.mock("@/db", () => {
  const chain = { from: () => chain, where: () => mocks.versionCount() as unknown };
  return { getDb: () => ({ select: () => chain }) };
});

const { artifactMarkdownResponse, artifactRawResponse, markdownLimitChecks } = await import("./serve");

const publicId = "1PdUWmyQHs9x2dGxYtZ8aR";
const savedAt = new Date("2026-11-07T12:00:00.000Z");

interface FixtureOptions {
  visibility?: ArtifactVisibility;
  source?: "approved" | "latest";
  comments?: CommentSetting;
  kind?: string;
  content?: string;
}

/** What getViewableArtifact returns. `record` holds the latest (possibly pending) fields; `view` what this reader may read. */
function viewable(options: FixtureOptions = {}): ViewableArtifact {
  const source = options.source ?? "latest";
  const fixture = {
    record: { id: "internal", publicId, userId: "author", teamId: "team", visibility: options.visibility ?? "public", comments: options.comments ?? "signed_in", title: "Pending title", icon: null },
    version: source === "approved" ? { source, versionId: "v-approved" } : { source, versionId: null },
    served: { title: "Approved title", icon: null, updatedAt: savedAt, editedBy: "author" },
    canEdit: false,
    isTeamMember: false,
    editPending: null,
    view: {
      title: source === "approved" ? "Approved title" : "Pending title",
      icon: "🧪",
      summary: "",
      content: options.content ?? (source === "approved" ? "Approved body." : "Pending body."),
      kind: options.kind ?? "markdown",
      language: "",
      project: "",
      source: "",
      metadata: {},
      updatedAt: savedAt,
      editedBy: "author",
    },
  };
  return fixture as unknown as ViewableArtifact;
}

function request(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://artifacts.space${path}`, { headers });
}

const commentView = { id: "c1", parentId: null, body: "Visible comment body", deleted: false, edited: false, author: null, mentions: [], canChange: false, createdAt: savedAt.toISOString(), updatedAt: savedAt.toISOString() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");
  // Network keys need a secret to hash with (src/lib/abuse/network-key.ts).
  vi.stubEnv("BETTER_AUTH_SECRET", "test-network-key-secret");
  mocks.hitRateLimits.mockResolvedValue(null);
  mocks.getSession.mockResolvedValue(null);
  mocks.filesForViewer.mockResolvedValue([]);
  mocks.loadArtifactByline.mockResolvedValue({ author: "@author", avatar: null, teamName: null });
  mocks.lastEditorsFor.mockResolvedValue(new Map([["author", { id: "author", kind: "person", handle: "author", name: "Author" }]]));
  mocks.versionCount.mockResolvedValue([{ count: 3 }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("artifactMarkdownResponse", () => {
  it("should answer with Markdown, Vary: Accept, noindex, and the share page's cache policy when a public artifact is read signed out", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable());
    const response = await artifactMarkdownResponse(request(`/artifact/${publicId}.md`), publicId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    const body = await response.text();
    expect(body).toContain("# 🧪 Pending title");
    expect(body).toContain("- Version: 3");
    expect(mocks.getViewableArtifact).toHaveBeenCalledWith(publicId, null);
  });

  it("should never put the project or tags in the Markdown, even when the author reads it with a token", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue({ userId: "author", access: "read", via: "api-token", tokenKey: "api:t1" });
    const authored = viewable({ visibility: "private" });
    Object.assign(authored.record, { projectId: "project-1", project: "Secret project label", tags: ["secret-tag-label"] });
    Object.assign(authored, { canEdit: true, isTeamMember: true });
    Object.assign(authored.view, { project: "Secret project label" });
    mocks.getViewableArtifact.mockResolvedValue(authored);
    const body = await (await artifactMarkdownResponse(request(`/artifact/${publicId}.md`, { authorization: "Bearer artifacts_secret" }), publicId)).text();
    expect(body).toContain("Pending title");
    expect(body).not.toContain("Secret project label");
    expect(body).not.toContain("project-1");
    expect(body).not.toContain("secret-tag-label");
  });

  it("should answer with the same Markdown 404 when a private artifact is read without auth as when it does not exist", async () => {
    mocks.getViewableArtifact.mockResolvedValue(null);
    const unauthorized = await artifactMarkdownResponse(request(`/artifact/${publicId}.md`), publicId);
    const missing = await artifactMarkdownResponse(request("/artifact/AAAAAAAAAAAAAAAAAAAAAA.md"), "AAAAAAAAAAAAAAAAAAAAAA");
    expect(unauthorized.status).toBe(404);
    expect(mocks.getViewableArtifact).toHaveBeenCalledWith(publicId, null);
    const [first, second] = [await unauthorized.text(), await missing.text()];
    expect(first).toBe(second);
    expect(first).not.toContain("Pending");
    expect(unauthorized.headers.get("vary")).toContain("Accept");
    expect([...unauthorized.headers.entries()]).toEqual([...missing.headers.entries()]);
  });

  it("should read as the token's user with private caching and the MCP read limits when a valid bearer token is sent", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue({ userId: "reader", access: "read", via: "api-token", tokenKey: "api:t1" });
    mocks.getViewableArtifact.mockResolvedValue(viewable({ visibility: "private" }));
    const response = await artifactMarkdownResponse(request(`/artifact/${publicId}.md`, { authorization: "Bearer artifacts_secret" }), publicId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getViewableArtifact).toHaveBeenCalledWith(publicId, "reader");
    expect(mocks.hitRateLimits).toHaveBeenLastCalledWith([
      { name: "readByToken", subject: "api:t1" },
      { name: "readByUser", subject: "reader" },
    ]);
  });

  it("should refuse with 401 and read nothing when the bearer token is not accepted", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue(null);
    const response = await artifactMarkdownResponse(request(`/artifact/${publicId}.md`, { authorization: "Bearer nope" }), publicId);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("invalid_token");
    expect(mocks.getViewableArtifact).not.toHaveBeenCalled();
  });

  it("should read as the session user when the session cookie is sent", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "member" } });
    mocks.getViewableArtifact.mockResolvedValue(viewable({ visibility: "team" }));
    const response = await artifactMarkdownResponse(request(`/artifact/${publicId}`, { cookie: "better-auth.session_token=a.b" }), publicId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getViewableArtifact).toHaveBeenCalledWith(publicId, "member");
  });

  it("should serve the approved version, not the pending edit, when an outside reader gets the approved version", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable({ visibility: "link", source: "approved" }));
    const body = await (await artifactMarkdownResponse(request(`/artifact/${publicId}.md`), publicId)).text();
    expect(body).toContain("# 🧪 Approved title");
    expect(body).toContain("Approved body.");
    expect(body).toContain("(the last approved version)");
    expect(body).not.toContain("Pending");
  });

  it("should never load comments when a signed-out reader asks for them", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable());
    const body = await (await artifactMarkdownResponse(request(`/artifact/${publicId}.md?comments=1`), publicId)).text();
    expect(mocks.listComments).not.toHaveBeenCalled();
    expect(body).toContain("Comments are shown only to signed-in readers.");
  });

  it("should include only the reason when the comments setting hides the thread from this reader", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue({ userId: "outsider", access: "full", via: "api-token", tokenKey: "api:t2" });
    mocks.getViewableArtifact.mockResolvedValue(viewable({ comments: "team" }));
    mocks.listComments.mockRejectedValue(new UserFacingError("Only the author and members of the artifact's team can read and write its comments."));
    const body = await (await artifactMarkdownResponse(request(`/artifact/${publicId}.md?comments=1`, { authorization: "Bearer t" }), publicId)).text();
    expect(mocks.listComments).toHaveBeenCalledWith("outsider", publicId);
    expect(body).toContain("Only the author and members");
    expect(body).not.toContain("Visible comment body");
    expect(body).not.toContain("untrusted-comment");
  });

  it("should append the thread labelled as untrusted when the reader may see comments", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue({ userId: "member", access: "full", via: "api-token", tokenKey: "api:t3" });
    mocks.getViewableArtifact.mockResolvedValue(viewable());
    mocks.listComments.mockResolvedValue({ thread: {}, comments: [commentView] });
    const body = await (await artifactMarkdownResponse(request(`/artifact/${publicId}.md?comments=1`, { authorization: "Bearer t" }), publicId)).text();
    expect(body).toContain("Untrusted content.");
    expect(body).toContain("```untrusted-comment\nVisible comment body\n```");
  });

  it("should leave comments out when the reader does not ask for them", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable());
    const body = await (await artifactMarkdownResponse(request(`/artifact/${publicId}.md`), publicId)).text();
    expect(body).not.toContain("## Comments");
    expect(mocks.listComments).not.toHaveBeenCalled();
  });

  it("should answer 429 with Vary and read nothing when the network is over the share page limit", async () => {
    mocks.hitRateLimits.mockResolvedValue({ name: "artifactPageByNetwork", retryAfterSeconds: 300 });
    const response = await artifactMarkdownResponse(request(`/artifact/${publicId}.md`), publicId);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("300");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(mocks.getViewableArtifact).not.toHaveBeenCalled();
  });

  it("should answer 503 without details when loading fails", async () => {
    mocks.getViewableArtifact.mockRejectedValue(new Error("db down"));
    const response = await artifactMarkdownResponse(request(`/artifact/${publicId}.md`), publicId);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("db down");
  });
});

describe("artifactRawResponse", () => {
  it("should serve CSV as text/csv and everything else as sandboxed plain text", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable({ kind: "csv", content: "a,b\n1,2" }));
    const csv = await artifactRawResponse(request(`/artifact/${publicId}/raw`), publicId);
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(await csv.text()).toBe("a,b\n1,2");
    mocks.getViewableArtifact.mockResolvedValue(viewable({ kind: "svg", content: "<svg onload=alert(1)/>" }));
    const svg = await artifactRawResponse(request(`/artifact/${publicId}/raw`), publicId);
    expect(svg.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(svg.headers.get("content-security-policy")).toContain("sandbox");
    expect(svg.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("should answer the Markdown 404 when the reader may not read the artifact", async () => {
    mocks.getViewableArtifact.mockResolvedValue(null);
    expect((await artifactRawResponse(request(`/artifact/${publicId}/raw`), publicId)).status).toBe(404);
  });
});

describe("markdownLimitChecks", () => {
  it("should count only the per-network limit for signed-out and session readers", () => {
    expect(markdownLimitChecks("net", null)).toEqual([{ name: "artifactPageByNetwork", subject: "net" }]);
    expect(markdownLimitChecks("net", { status: "session", userId: "u" })).toEqual([{ name: "artifactPageByNetwork", subject: "net" }]);
  });
});
