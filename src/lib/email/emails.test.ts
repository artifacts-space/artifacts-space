import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMagicLinkEmail } from "@/lib/auth/magic-link-email";
import { sendMentionEmail } from "@/lib/comments/mention-email";
import { sendReportEmail } from "@/lib/reports/email";
import { type EmailMessage, sendEmail } from "@/lib/sendir";
import { sendTeamInvitationEmail } from "@/lib/teams/invitation-email";

// The send boundary is mocked: these tests never reach Sendir.
vi.mock("@/lib/sendir", () => ({
  isSendirConfigured: () => true,
  sendEmail: vi.fn(() => Promise.resolve({ data: { id: "sent" }, error: null })),
}));

// The daily email budget always has room here; budget.test.ts covers refusals.
vi.mock("@/lib/email/budget", () => ({ reserveBudgetedEmail: () => Promise.resolve(true) }));

const LOGO = '<img src="https://artifacts.space/email/artifacts-space-icon.png"';
const HOSTILE = `<script>alert("x")</script>`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function lastSend(): { message: EmailMessage; key: string } {
  const call = vi.mocked(sendEmail).mock.calls.at(-1);
  if (!call) throw new Error("No email was sent");
  return { message: call[0], key: call[1].idempotencyKey };
}

async function sendEach() {
  await sendMagicLinkEmail({ email: "ann@example.com", url: "https://artifacts.space/api/auth/magic-link/verify?token=t1", token: "t1" });
  const magic = lastSend();
  await sendTeamInvitationEmail({ invitationId: "inv1", email: "ann@example.com", teamName: HOSTILE, inviterName: HOSTILE });
  const invitation = lastSend();
  await sendMentionEmail({ mentionId: "m1", email: "ann@example.com", authorLabel: HOSTILE, artifactTitle: HOSTILE, publicId: "pub1", commentId: "c1" });
  const mention = lastSend();
  await sendReportEmail({
    reportId: "r1", ownerId: "o1", ownerEmail: "ann@example.com", teamName: HOSTILE, teamSlug: "acme",
    artifactTitle: HOSTILE, publicId: "pub1", reasonLabel: HOSTILE,
  });
  const report = lastSend();
  return { magic, invitation, mention, report };
}

describe("transactional emails", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");
    vi.mocked(sendEmail).mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should use the shared layout with an absolute logo URL when any email is sent", async () => {
    const sent = await sendEach();
    for (const { message } of Object.values(sent)) {
      expect(message.html).toContain(LOGO);
      expect(message.html).toContain('class="em-card"');
      expect(message.text).toContain("\n--\n");
    }
  });

  it("should escape user text when an email includes names or titles", async () => {
    const { invitation, mention, report } = await sendEach();
    for (const { message } of [invitation, mention, report]) {
      expect(message.html).not.toContain("<script>");
      expect(message.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    }
  });

  it("should put the action link in the plain text when any email is sent", async () => {
    const { magic, invitation, mention, report } = await sendEach();
    expect(magic.message.text).toContain("https://artifacts.space/api/auth/magic-link/verify?token=t1");
    expect(invitation.message.text).toContain("https://artifacts.space/invitations/inv1");
    expect(mention.message.text).toContain("https://artifacts.space/threads/pub1#comment-c1");
    expect(report.message.text).toContain("https://artifacts.space/teams/acme");
    expect(report.message.text).toContain("https://artifacts.space/artifact/pub1");
  });

  it("should keep subjects, links, expiry copy, and idempotency keys when the layout changes", async () => {
    const { magic, invitation, mention, report } = await sendEach();
    expect(magic.message.subject).toBe("Sign in to artifacts.space");
    expect(magic.message.html).toContain('href="https://artifacts.space/api/auth/magic-link/verify?token=t1"');
    expect(magic.message.html).toContain("expires in 10 minutes");
    expect(magic.key).toBe(`magic-link:${sha("t1")}`);
    expect(invitation.message.subject).toBe(`Join ${HOSTILE} on artifacts.space`);
    expect(invitation.message.html).toContain("expires in 7 days");
    expect(invitation.key).toBe(`team-invitation:${sha("inv1")}`);
    expect(mention.message.subject).toBe(`${HOSTILE} mentioned you on artifacts.space`);
    expect(mention.key).toBe(`mention:${sha("m1")}`);
    expect(report.message.subject).toBe(`Report on “${HOSTILE}” in ${HOSTILE}`);
    expect(report.key).toBe(`artifact-report:${sha("r1:o1")}`);
  });

  it("should render the sign-in heading with a quiet site link when the magic link is sent", async () => {
    const { magic } = await sendEach();
    expect(magic.message.html).toMatch(/<h1[^>]*>Sign in to <a href="https:\/\/artifacts\.space\/"[^>]*text-decoration:none[^>]*>artifacts\.space<\/a><\/h1>/);
  });
});
