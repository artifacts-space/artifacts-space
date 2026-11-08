import { createECDH } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PushSubscriptionRecord } from "@/db/notification-schema";

import { testPushMessage } from "./push-rules";

const devices = vi.hoisted(() => ({
  subscriptionsFor: vi.fn<(ids: readonly string[]) => Promise<PushSubscriptionRecord[]>>(),
  pruneDevices: vi.fn<(ids: readonly string[]) => Promise<void>>(),
  touchDevices: vi.fn<(ids: readonly string[]) => Promise<void>>(),
}));
vi.mock("./devices", () => devices);

const server = createECDH("prime256v1");
server.generateKeys();
vi.stubEnv("VAPID_PUBLIC_KEY", server.getPublicKey().toString("base64url"));
vi.stubEnv("VAPID_PRIVATE_KEY", server.getPrivateKey().toString("base64url"));
vi.stubEnv("VAPID_SUBJECT", "mailto:ops@example.com");

const { sendPushMessages } = await import("./send");

function browser(id: string, endpoint: string): PushSubscriptionRecord {
  const keys = createECDH("prime256v1");
  keys.generateKeys();
  return { id, userId: "ada", endpoint, p256dh: keys.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url"), label: "Chrome on macOS", createdAt: new Date(), lastUsedAt: null };
}

const fcm = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;

beforeEach(() => {
  vi.clearAllMocks();
  devices.pruneDevices.mockResolvedValue();
  devices.touchDevices.mockResolvedValue();
});

describe("sendPushMessages", () => {
  it("should send an encrypted, signed message and record the browser when the push service accepts it", async () => {
    devices.subscriptionsFor.mockResolvedValue([browser("d1", fcm("a"))]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    const report = await sendPushMessages(new Map([["ada", testPushMessage()]]), fetcher);
    expect(report).toEqual({ sent: 1, failed: 0, removed: 0 });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(fcm("a"));
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(headers.get("Authorization")).toMatch(/^vapid t=.+, k=/);
    expect(new TextDecoder().decode(init?.body as Uint8Array)).not.toContain("Browser notifications are on");
    expect(devices.touchDevices).toHaveBeenCalledWith(["d1"]);
  });

  it("should remove a browser when the push service says it is gone", async () => {
    devices.subscriptionsFor.mockResolvedValue([browser("d1", fcm("a")), browser("d2", fcm("b"))]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 410 })).mockResolvedValueOnce(new Response(null, { status: 500 }));
    const report = await sendPushMessages(new Map([["ada", testPushMessage()]]), fetcher);
    expect(report).toEqual({ sent: 0, failed: 1, removed: 1 });
    expect(devices.pruneDevices).toHaveBeenCalledWith(["d1"]);
  });

  it("should never call an address outside the browser push services, and drop it", async () => {
    devices.subscriptionsFor.mockResolvedValue([browser("d1", "https://169.254.169.254/latest")]);
    const fetcher = vi.fn<typeof fetch>();
    const report = await sendPushMessages(new Map([["ada", testPushMessage()]]), fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(report.removed).toBe(1);
  });

  it("should count a network error as a failure without throwing", async () => {
    devices.subscriptionsFor.mockResolvedValue([browser("d1", fcm("a"))]);
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(sendPushMessages(new Map([["ada", testPushMessage()]]), fetcher)).resolves.toEqual({ sent: 0, failed: 1, removed: 0 });
  });
});
