import type { McpAccess } from "./scopes";

/** What a connection can do, in plain words, for the consent page and Connections. */
export const accessAbilities: Record<McpAccess, readonly string[]> = {
  full: [
    "Read and search your artifacts, comments, and files.",
    "Create, change, share, and delete your artifacts.",
    "Comment, reply, and upload files for you.",
  ],
  read: ["Read and search your artifacts, comments, and files.", "It cannot change, share, or delete anything."],
};

/** Short access labels for lists. */
export const accessLabels: Record<McpAccess, string> = {
  full: "Full access",
  read: "Read-only",
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Where the browser goes after the person chooses, in words: "an app on this
 * computer" for loopback and custom-scheme callbacks (Claude Code, Cursor),
 * or the website's host name. Null when the URI does not parse.
 */
export function returnDestination(redirectUri: string | null | undefined): string | null {
  if (!redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "an app on this computer";
    if (loopbackHosts.has(url.hostname)) return "an app on this computer";
    return url.hostname;
  } catch {
    return null;
  }
}

/** The honest note about who the app is, since anyone can register one. */
export function identityNote(client: { fromMetadataDocument: boolean; clientId: string }): string {
  if (client.fromMetadataDocument) {
    const host = hostOf(client.clientId);
    if (host) return `This app identifies itself through ${host}. Only approve it if you started this connection.`;
  }
  return "This app registered itself. Only approve it if you started this connection.";
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
