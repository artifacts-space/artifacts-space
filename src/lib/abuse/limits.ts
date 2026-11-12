import { SENDIR_DAILY_RECIPIENTS } from "@/lib/email/budget-rules";

/**
 * Every rate limit in one place. Counts are per key (a user, a token, a team,
 * or a hashed network address for signed-out visitors) per window. Limits are
 * runaway-only: generous for real work (about one request a second for a
 * person), and they stop runaway agents and scripted abuse. Never ration.
 */
const quarterHour = 900;
const hour = 3600;
const day = 86_400;

export const rateLimits = {
  /** New artifacts per user per hour, from the web app and MCP together. */
  artifactCreate: { limit: 120, windowSeconds: hour },
  /** Artifact edits (content, fields, or attached files) per user per hour, from the web app and MCP together. */
  artifactUpdate: { limit: 1200, windowSeconds: hour },
  /**
   * Web editor autosaves that continue an open editing session, per user per
   * hour. They fold into the session's one version, so they count here
   * instead of artifactUpdate (the session's first save counts there). The
   * editor sends at most one every 5 seconds (720 an hour, see
   * autosave-rules.ts); this is the runaway cap.
   */
  artifactAutosave: { limit: 3600, windowSeconds: hour },
  /** Artifact edits per MCP token per hour, so one runaway agent leaves room for the person's other agents. */
  artifactUpdateByToken: { limit: 600, windowSeconds: hour },
  /** Project and tag changes (moving artifacts, creating, renaming, merging, deleting projects) per user per hour. */
  organize: { limit: 1200, windowSeconds: hour },
  /**
   * Agent harness choices ("Made with" on an artifact, the agent of a
   * connection) per user per hour. A label that files no version, so it has
   * its own bucket and never uses up artifact saves.
   */
  harnessChoice: { limit: 600, windowSeconds: hour },
  /**
   * "I'm editing" signals from the web editor per user per hour (src/lib/edits).
   * The editor sends at most one every 20 seconds while the person types, so
   * 180 an hour per open editor; this is the runaway cap.
   */
  editLease: { limit: 1200, windowSeconds: hour },
  /**
   * MCP `initialize` requests whose clientInfo is stored, per user per hour.
   * Over the limit the request still runs; only the clientInfo is not stored,
   * so a client that renames itself on every connect cannot churn the row.
   */
  clientInfoRecord: { limit: 600, windowSeconds: hour },
  /** Reads (MCP read tools and opening artifacts in the workspace) per user per hour. */
  readByUser: { limit: 3600, windowSeconds: hour },
  /** MCP read tool calls per token per hour. */
  readByToken: { limit: 1800, windowSeconds: hour },
  /** File views and downloads (/api/files) per network address per hour. */
  fileDownloadByNetwork: { limit: 3600, windowSeconds: hour },
  /**
   * Every /api/files request per network address per hour: views and
   * downloads, and video and audio playback follow-ups (a Range that starts
   * past the first byte: seeks and later parts), which skip the view limit
   * above (download-limit-rules.ts). The total no Range header can get past.
   */
  fileRequestByNetwork: { limit: 7200, windowSeconds: hour },
  /** The same follow-ups for one file, per network address per hour: the header is the client's to send, so no one file gets the whole budget. */
  fileRangeByNetworkFile: { limit: 1800, windowSeconds: hour },
  /**
   * Team icon views (/api/teams/<id>/icon) per signed-in member per hour.
   * Only members can load an icon, so each person gets their own budget and
   * an office behind one address never shares one. Browsers keep each icon
   * for a day (teamIconCacheControl), so a member normally loads each one
   * about once a day. A page shows at most a few dozen icons; this still
   * covers 30 page loads an hour of 36 icons each with the cache off. The
   * route streams icons itself, so this also caps what one member costs:
   * at most 1,200 x 1 MB (TEAM_ICON_UPLOAD_MAX_BYTES), about 1.2 GB an
   * hour, where a real icon is a few dozen KB.
   */
  teamIconByUser: { limit: 1200, windowSeconds: hour },
  /**
   * Team icon views per network address per hour: an abuse backstop only,
   * for many accounts or signed-out requests from one address. A 500-person
   * office whose members each load 50 icons in one hour (more than a cold
   * cache on a busy morning) makes 25,000, under this. Worst case it lets
   * one address pull about 30 GB an hour of 1 MB icons, and only with 25 or
   * more accounts each at its own 1,200 limit; real icons are a few dozen KB.
   */
  teamIconByNetwork: { limit: 30_000, windowSeconds: hour },
  /** Artifact page views (/artifact/<id>) per network address per hour. */
  artifactPageByNetwork: { limit: 1800, windowSeconds: hour },
  /** Counted page views (the view beacon) per network address per hour, across all artifacts. Over the limit, views are not counted; the page is unaffected. */
  viewByNetwork: { limit: 1200, windowSeconds: hour },
  /** Counted page views of one artifact per network address per hour, so one address cannot inflate a page's views. */
  viewByNetworkArtifact: { limit: 60, windowSeconds: hour },
  /** Artifact preview images rendered per network address per hour. Only CDN misses count; crawlers share addresses and retry, so it is generous. */
  ogImageByNetwork: { limit: 3600, windowSeconds: hour },
  /** Sharing changes per user per hour (making an artifact private is never limited). */
  sharingRequest: { limit: 30, windowSeconds: hour },
  /** Reports per signed-in user per hour. */
  reportByUser: { limit: 10, windowSeconds: hour },
  /**
   * Reports per network address, signed in or not: a short window, so a
   * reader behind a shared address (an office, a school, mobile carrier NAT)
   * waits minutes, not an hour, plus a daily ceiling. Report emails share the
   * non-sign-in email budget (src/lib/email/budget-rules.ts) with invitations
   * and mentions, so one address may file only a few a day.
   */
  reportByNetwork: { limit: 5, windowSeconds: quarterHour },
  reportByNetworkDay: { limit: 10, windowSeconds: day },
  /** Reports about one artifact per network address per hour. Each report emails the site operator. */
  reportByNetworkArtifact: { limit: 3, windowSeconds: hour },
  /**
   * "Something's not working" reports per signed-in person per hour. Each
   * one posts to the team's Slack channel, so a person may send a few.
   */
  feedbackByUser: { limit: 5, windowSeconds: hour },
  /** Started file uploads per user per hour, from the web app and MCP together. */
  fileUpload: { limit: 200, windowSeconds: hour },
  /** Comments per agent per minute and per hour. Agents are stricter, to stop runaway loops. */
  agentCommentMinute: { limit: 6, windowSeconds: 60 },
  agentCommentHour: { limit: 60, windowSeconds: hour },
  /** Comments per person per minute and per hour. */
  personCommentMinute: { limit: 20, windowSeconds: 60 },
  personCommentHour: { limit: 300, windowSeconds: hour },
  /** Threads resolved or reopened per person per minute and per hour, so nobody hides a team's comments in a loop. */
  commentResolveMinute: { limit: 30, windowSeconds: 60 },
  commentResolveHour: { limit: 300, windowSeconds: hour },
  /** Team invitations per inviting person per hour and per day, and per team per day. Each one sends an email. */
  teamInviteByUserHour: { limit: 20, windowSeconds: hour },
  teamInviteByUserDay: { limit: 50, windowSeconds: day },
  teamInviteByTeamDay: { limit: 100, windowSeconds: day },
  /**
   * Sign-in links per network address. Every link is an email, and a link to
   * a made-up address bounces, which hurts the site's sending reputation for
   * everyone. The one-minute window stops a scripted burst after two emails
   * (five links to made-up addresses in two seconds once got through). The
   * 15-minute window still lets a group behind one shared address sign in
   * together within a few minutes, and a refused network waits minutes, not
   * an hour. The daily ceiling keeps one address to a tenth of Sendir's
   * daily recipient cap, which every sign-in on the site shares: once the cap
   * is spent, nobody gets a sign-in link until midnight UTC.
   */
  magicLinkByNetworkMinute: { limit: 2, windowSeconds: 60 },
  magicLinkByNetwork: { limit: 10, windowSeconds: quarterHour },
  magicLinkByNetworkDay: { limit: Math.floor(SENDIR_DAILY_RECIPIENTS / 10), windowSeconds: day },
  /**
   * Sign-in links per email address, from any network, so nobody can flood
   * one inbox: one a minute (a second click waits for the first email), and
   * a few an hour.
   */
  magicLinkByEmailMinute: { limit: 1, windowSeconds: 60 },
  magicLinkByEmail: { limit: 5, windowSeconds: hour },
  /**
   * Password sign-in tries per network (password-sign-in-rules.ts; an IPv6
   * client counts by its /64). Only accounts the owner gave a password can
   * sign in this way, so real use is a handful a day; each try also costs a
   * password hash, which these cap. Refused tries count too, so a guessing
   * script stays refused.
   */
  passwordSignInByNetwork: { limit: 20, windowSeconds: quarterHour },
  passwordSignInByNetworkDay: { limit: 100, windowSeconds: day },
  /**
   * Password sign-in tries for one email address from one network. Someone
   * else's tries from their own network never count here, so they cannot
   * lock a reviewer out.
   */
  passwordSignInByNetworkEmail: { limit: 10, windowSeconds: quarterHour },
  /**
   * Failed password sign-ins for one email address from every network,
   * counted after the answer (a refused try never counts). A cost backstop
   * set high, so scattered guessing cannot lock the address for long; the
   * 24-character random passwords are what stop guessing. Known and unknown
   * addresses are counted alike.
   */
  passwordSignInFailuresByEmail: { limit: 500, windowSeconds: day },
  /** New teams, agents, and access tokens per person per hour. Each agent gets its own limits, so agents are capped too. */
  teamCreate: { limit: 10, windowSeconds: hour },
  agentCreate: { limit: 20, windowSeconds: hour },
  tokenCreate: { limit: 30, windowSeconds: hour },
  /** Browsers turned on for notifications, and test notifications, per person per hour. Each test calls the push services. */
  pushDevice: { limit: 30, windowSeconds: hour },
  pushTest: { limit: 10, windowSeconds: hour },
  /** MCP app registrations (OAuth dynamic client registration) per network address per hour. */
  oauthRegister: { limit: 20, windowSeconds: hour },
  /** OAuth authorization requests per network address per hour. */
  oauthAuthorize: { limit: 60, windowSeconds: hour },
  /** OAuth token requests (code exchanges and refreshes) per network address per hour. */
  oauthToken: { limit: 300, windowSeconds: hour },
} as const satisfies Record<string, { limit: number; windowSeconds: number }>;

export type RateLimitName = keyof typeof rateLimits;

/** What each limit protects, in words for the error message. */
export const rateLimitMessages: Record<RateLimitName, string> = {
  artifactCreate: "You have created a lot of artifacts in the last hour.",
  artifactUpdate: "You have changed artifacts a lot in the last hour.",
  artifactAutosave: "You have saved changes a lot in the last hour.",
  artifactUpdateByToken: "This connection has changed artifacts a lot in the last hour.",
  organize: "You have changed projects and tags a lot in the last hour.",
  harnessChoice: "You have changed agent labels a lot in the last hour.",
  editLease: "Your editors have said you are typing a lot in the last hour.",
  clientInfoRecord: "Your agents have connected a lot in the last hour.",
  readByUser: "You have read a lot of artifacts in the last hour.",
  readByToken: "This connection has read a lot in the last hour.",
  fileDownloadByNetwork: "Your network has opened a lot of files in the last hour.",
  fileRequestByNetwork: "Your network has opened or played a lot of files in the last hour.",
  fileRangeByNetworkFile: "Your network has played this file a lot in the last hour.",
  teamIconByUser: "You have loaded a lot of team icons in the last hour.",
  teamIconByNetwork: "Your network has loaded a lot of team icons in the last hour.",
  artifactPageByNetwork: "Your network has opened a lot of artifact pages in the last hour.",
  viewByNetwork: "Your network has opened a lot of artifact pages in the last hour, so further views are not counted.",
  viewByNetworkArtifact: "Your network has opened this artifact a lot in the last hour, so further views are not counted.",
  ogImageByNetwork: "Your network has loaded a lot of artifact preview images in the last hour.",
  sharingRequest: "You have changed sharing a lot in the last hour.",
  reportByUser: "You have sent a lot of reports in the last hour.",
  reportByNetwork: "We have received a lot of reports from your network in the last few minutes.",
  reportByNetworkDay: "We have received a lot of reports from your network today.",
  reportByNetworkArtifact: "We have received a lot of reports about this artifact from your network in the last hour.",
  feedbackByUser: "You have sent several problem reports in the last hour.",
  fileUpload: "You have uploaded a lot of files in the last hour.",
  agentCommentMinute: "You have posted a lot of comments in the last minute.",
  agentCommentHour: "You have posted a lot of comments in the last hour.",
  personCommentMinute: "You have posted a lot of comments in the last minute.",
  personCommentHour: "You have posted a lot of comments in the last hour.",
  commentResolveMinute: "You have resolved or reopened a lot of comments in the last minute.",
  commentResolveHour: "You have resolved or reopened a lot of comments in the last hour.",
  teamInviteByUserHour: "You have sent a lot of invitations in the last hour.",
  teamInviteByUserDay: "You have sent a lot of invitations today.",
  teamInviteByTeamDay: "This team has sent a lot of invitations today.",
  magicLinkByNetworkMinute: "Your network has asked for several sign-in links in the last minute.",
  magicLinkByNetwork: "Your network has asked for a lot of sign-in links in the last few minutes.",
  magicLinkByNetworkDay: "Your network has asked for a lot of sign-in links today.",
  magicLinkByEmailMinute: "This email address asked for a sign-in link in the last minute. Check your inbox and spam folder for it.",
  magicLinkByEmail: "This email address has asked for a lot of sign-in links in the last hour.",
  passwordSignInByNetwork: "Your network has tried to sign in with a password a lot in the last few minutes.",
  passwordSignInByNetworkDay: "Your network has tried to sign in with a password a lot today.",
  passwordSignInByNetworkEmail: "You have tried to sign in to this email address a lot in the last few minutes.",
  passwordSignInFailuresByEmail: "This email address has had a lot of failed password sign-ins today.",
  teamCreate: "You have created a lot of teams in the last hour.",
  agentCreate: "You have added a lot of agents in the last hour.",
  tokenCreate: "You have created a lot of access tokens in the last hour.",
  pushDevice: "You have turned on browser notifications a lot in the last hour.",
  pushTest: "You have sent a lot of test notifications in the last hour.",
  oauthRegister: "Your network has registered a lot of apps in the last hour.",
  oauthAuthorize: "Your network has started a lot of app connections in the last hour.",
  oauthToken: "Your network has asked for a lot of access tokens in the last hour.",
};
