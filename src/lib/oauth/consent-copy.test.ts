import { describe, expect, it } from "vitest";

import { identityNote, returnDestination } from "./consent-copy";

describe("returnDestination", () => {
  it("should name this computer when the callback is loopback or a custom scheme", () => {
    expect(returnDestination("http://127.0.0.1:53682/callback")).toBe("an app on this computer");
    expect(returnDestination("http://localhost:3000/cb")).toBe("an app on this computer");
    expect(returnDestination("cursor://anysphere.cursor-mcp/oauth/callback")).toBe("an app on this computer");
  });

  it("should name the website when the callback is on the web", () => {
    expect(returnDestination("https://app.example.com/oauth/cb")).toBe("app.example.com");
  });

  it("should return null when there is no usable callback", () => {
    expect(returnDestination(null)).toBeNull();
    expect(returnDestination("not a url")).toBeNull();
  });
});

describe("identityNote", () => {
  it("should say the app registered itself when it used dynamic registration", () => {
    expect(identityNote({ fromMetadataDocument: false, clientId: "abc" })).toBe("This app registered itself. Only approve it if you started this connection.");
  });

  it("should name the domain when the app identified itself with a metadata document", () => {
    expect(identityNote({ fromMetadataDocument: true, clientId: "https://claude.ai/oauth/mcp-client.json" })).toMatch(/through claude\.ai\./);
  });
});
