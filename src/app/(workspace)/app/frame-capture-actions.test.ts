import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureNotWantedError } from "@/lib/canvas/capture-errors";
import { UserFacingError } from "@/lib/user-facing-error";

/*
 * The frame capture actions: each checks the session before anything else,
 * hands the signed-in person's id (never one from the input) to the service,
 * and turns a refusal into a message without logging it. The session and
 * the service are mocked at their boundaries; the service's own access
 * checks are tested against a database in src/lib/canvas/captures.db.test.ts.
 */

const mocks = vi.hoisted(() => ({ session: vi.fn(), needed: vi.fn(), start: vi.fn(), finish: vi.fn() }));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/canvas/captures", () => ({ capturesNeeded: mocks.needed, startCapture: mocks.start, finishCapture: mocks.finish }));

const { finishFrameCaptureAction, frameCapturesNeededAction, startFrameCaptureAction } = await import("./frame-capture-actions");

const startInput = { artifactId: "artifact-1", frameHash: "a".repeat(64), mode: "light" as const, height: 600, partial: false, parts: [{ bytes: 9000, contentType: "image/webp" as const }] };
const captureId = "0b6f6d43-8a8f-4b52-9f44-2f8c1a6d3e10";
const signedOut = { success: false, error: "Your session ended. Sign in again." };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.needed.mockResolvedValue({ state: "not-now" });
  mocks.start.mockResolvedValue({ captureId, uploads: [] });
  mocks.finish.mockResolvedValue({ current: true });
});

describe("frame capture actions", () => {
  it("should do nothing when the person is signed out", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await frameCapturesNeededAction("artifact-1")).toEqual(signedOut);
    expect(await startFrameCaptureAction(startInput)).toEqual(signedOut);
    expect(await finishFrameCaptureAction(captureId)).toEqual(signedOut);
    expect(mocks.needed).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("should act as the signed-in person when they are signed in", async () => {
    expect(await frameCapturesNeededAction(" artifact-1 ")).toEqual({ success: true, data: { state: "not-now" } });
    expect(await startFrameCaptureAction(startInput)).toEqual({ success: true, data: { state: "started", captureId, uploads: [] } });
    expect(await finishFrameCaptureAction(captureId)).toEqual({ success: true, data: { current: true } });
    expect(mocks.needed).toHaveBeenCalledWith("user-1", "artifact-1");
    expect(mocks.start).toHaveBeenCalledWith("user-1", startInput);
    expect(mocks.finish).toHaveBeenCalledWith("user-1", captureId);
  });

  it("should refuse an artifact id that is not an id before asking the service", async () => {
    expect((await frameCapturesNeededAction("")).success).toBe(false);
    expect((await frameCapturesNeededAction("x".repeat(201))).success).toBe(false);
    expect((await frameCapturesNeededAction(42 as never)).success).toBe(false);
    expect(mocks.needed).not.toHaveBeenCalled();
  });

  it("should answer not-wanted, not a failure, when the drawing is no longer needed", async () => {
    mocks.start.mockRejectedValue(new CaptureNotWantedError("This frame already has a current image."));
    expect(await startFrameCaptureAction(startInput)).toEqual({ success: true, data: { state: "not-wanted" } });
  });

  it("should show the service's own words when it refuses, and log nothing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.start.mockRejectedValue(new UserFacingError("Artifact not found."));
    expect(await startFrameCaptureAction(startInput)).toEqual({ success: false, error: "Artifact not found." });
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("should show a plain fallback and log only the error's name when the service fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.finish.mockRejectedValue(new Error("https://r2.test/captures/a/b/1?X-Amz-Signature=secret"));
    expect(await finishFrameCaptureAction(captureId)).toEqual({ success: false, error: "The frame image could not be checked. Try again." });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("X-Amz-Signature");
    expect(logged).toHaveBeenCalledWith("[captures] Action failed", "Error");
    logged.mockRestore();
  });
});
