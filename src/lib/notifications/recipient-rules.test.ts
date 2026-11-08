import { describe, expect, it } from "vitest";

import { defaultPreferences, changePreference } from "./preference-rules";
import {
  commentRecipients,
  draftsFor,
  mayNotify,
  personFor,
  shareDecisionRecipient,
  shareRequestRecipients,
  type CommentFacts,
  type Party,
  type RecipientAccess,
} from "./recipient-rules";

const ada: Party = { userId: "ada", kind: "person", ownerId: null };
const bo: Party = { userId: "bo", kind: "person", ownerId: null };
const claude: Party = { userId: "claude", kind: "agent", ownerId: "ada" };
const orphanAgent: Party = { userId: "orphan", kind: "agent", ownerId: null };

function facts(overrides: Partial<CommentFacts> = {}): CommentFacts {
  return { writerId: "bo", writerMuted: false, artifactAuthor: ada, parentAuthor: null, mentionedPeople: [], ...overrides };
}

const full: RecipientAccess = { canRead: true, seesComments: true, managesRequestTeam: true };
const none: RecipientAccess = { canRead: false, seesComments: false, managesRequestTeam: false };

describe("personFor", () => {
  it("should return the person when the party is a person", () => {
    expect(personFor(ada)).toBe("ada");
  });

  it("should return the person who added the agent when the party is an agent", () => {
    expect(personFor(claude)).toBe("ada");
  });

  it("should return nobody when the agent's owner is gone", () => {
    expect(personFor(orphanAgent)).toBeNull();
  });
});

describe("commentRecipients", () => {
  it("should notify the artifact's author when someone else comments", () => {
    expect(commentRecipients(facts())).toEqual([{ recipientId: "ada", type: "comment" }]);
  });

  it("should notify the person who added the agent when the artifact is the agent's", () => {
    expect(commentRecipients(facts({ artifactAuthor: claude }))).toEqual([{ recipientId: "ada", type: "comment" }]);
  });

  it("should never notify the writer about their own comment", () => {
    expect(commentRecipients(facts({ writerId: "ada", mentionedPeople: ["ada"], parentAuthor: ada }))).toEqual([]);
  });

  it("should notify the owner when their own agent comments on its artifact", () => {
    expect(commentRecipients(facts({ writerId: "claude", artifactAuthor: claude }))).toEqual([{ recipientId: "ada", type: "comment" }]);
  });

  it("should send one notification per person, a mention first, when someone is mentioned, replied to, and the author", () => {
    const drafts = commentRecipients(facts({ parentAuthor: ada, mentionedPeople: ["ada"] }));
    expect(drafts).toEqual([{ recipientId: "ada", type: "mention" }]);
  });

  it("should send a reply before a comment when the parent's author also wrote the artifact", () => {
    expect(commentRecipients(facts({ parentAuthor: ada }))).toEqual([{ recipientId: "ada", type: "reply" }]);
  });

  it("should notify each mentioned person and the parent's author when they differ", () => {
    const drafts = commentRecipients(facts({ writerId: "eve", parentAuthor: bo, mentionedPeople: ["cy"] }));
    expect(drafts).toEqual([
      { recipientId: "cy", type: "mention" },
      { recipientId: "bo", type: "reply" },
      { recipientId: "ada", type: "comment" },
    ]);
  });

  it("should notify no person when the reply answers an agent's comment", () => {
    expect(commentRecipients(facts({ artifactAuthor: null, parentAuthor: claude }))).toEqual([]);
  });

  it("should notify nobody when the writer is a muted agent", () => {
    expect(commentRecipients(facts({ writerId: "claude", writerMuted: true, mentionedPeople: ["bo"] }))).toEqual([]);
  });
});

describe("shareRequestRecipients", () => {
  const managers = [
    { userId: "ada", isAgent: false },
    { userId: "bo", isAgent: false },
    { userId: "bot", isAgent: true },
  ];

  it("should notify the team's owners and admins who are people", () => {
    expect(shareRequestRecipients({ requester: { userId: "cy", kind: "person", ownerId: null }, managers })).toEqual([
      { recipientId: "ada", type: "share_request" },
      { recipientId: "bo", type: "share_request" },
    ]);
  });

  it("should not notify the requester when they are also an admin", () => {
    expect(shareRequestRecipients({ requester: bo, managers }).map((draft) => draft.recipientId)).toEqual(["ada"]);
  });

  it("should not notify the person whose agent asked", () => {
    expect(shareRequestRecipients({ requester: claude, managers }).map((draft) => draft.recipientId)).toEqual(["bo"]);
  });
});

describe("shareDecisionRecipient", () => {
  it("should tell the requester when the request is approved", () => {
    expect(shareDecisionRecipient({ status: "approved", requester: bo, deciderId: "ada" })).toEqual({ recipientId: "bo", type: "share_approved" });
  });

  it("should tell the requester when the request is declined", () => {
    expect(shareDecisionRecipient({ status: "denied", requester: bo, deciderId: "ada" })).toEqual({ recipientId: "bo", type: "share_declined" });
  });

  it("should tell the person who added the agent when an agent asked", () => {
    expect(shareDecisionRecipient({ status: "approved", requester: claude, deciderId: "bo" })).toEqual({ recipientId: "ada", type: "share_approved" });
  });

  it("should tell nobody when the request was canceled or is still open", () => {
    expect(shareDecisionRecipient({ status: "canceled", requester: bo, deciderId: "ada" })).toBeNull();
    expect(shareDecisionRecipient({ status: "pending", requester: bo, deciderId: "ada" })).toBeNull();
  });

  it("should not notify the person who decided it", () => {
    expect(shareDecisionRecipient({ status: "approved", requester: claude, deciderId: "ada" })).toBeNull();
  });
});

describe("mayNotify", () => {
  it("should refuse a comment notification when the person cannot read the artifact", () => {
    expect(mayNotify("comment", { ...none, seesComments: true, managesRequestTeam: true })).toBe(false);
  });

  it("should refuse a mention when the comments setting hides the comments from the person", () => {
    expect(mayNotify("mention", { ...full, seesComments: false })).toBe(false);
  });

  it("should refuse a waiting request when the person no longer manages the team, even if they can read the artifact", () => {
    expect(mayNotify("share_request", { ...full, managesRequestTeam: false })).toBe(false);
  });

  it("should refuse a decision when the person can no longer read the artifact", () => {
    expect(mayNotify("share_approved", { ...none, managesRequestTeam: true })).toBe(false);
  });

  it("should allow each kind when the person has the access it needs", () => {
    expect(mayNotify("reply", { ...none, canRead: true, seesComments: true })).toBe(true);
    expect(mayNotify("share_request", { ...none, managesRequestTeam: true })).toBe(true);
    expect(mayNotify("share_declined", { ...none, canRead: true })).toBe(true);
  });
});

describe("draftsFor", () => {
  const drafts = [
    { recipientId: "ada", type: "comment" as const },
    { recipientId: "bo", type: "mention" as const },
  ];

  it("should drop people who lost access to the artifact", () => {
    const kept = draftsFor(drafts, "inApp", { access: (id) => (id === "ada" ? none : full), preferences: () => defaultPreferences() });
    expect(kept.map((draft) => draft.recipientId)).toEqual(["bo"]);
  });

  it("should drop people who turned the event off for the channel", () => {
    const quiet = changePreference(defaultPreferences(), "comment", "inApp", false);
    const kept = draftsFor(drafts, "inApp", { access: () => full, preferences: (id) => (id === "ada" ? quiet : defaultPreferences()) });
    expect(kept.map((draft) => draft.recipientId)).toEqual(["bo"]);
  });

  it("should send no browser notifications when the person never turned them on", () => {
    expect(draftsFor(drafts, "browser", { access: () => full, preferences: () => defaultPreferences() })).toEqual([]);
  });
});
