"use server";

import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { CaptureNotWantedError } from "@/lib/canvas/capture-errors";
import { capturesNeeded, finishCapture, startCapture, type CapturesNeeded, type StartCaptureInput, type StartedCapture } from "@/lib/canvas/captures";
import { getSession } from "@/lib/session";
import { UserFacingError } from "@/lib/user-facing-error";

/*
 * Frame captures from the browser (src/lib/canvas/captures.ts): the tab of
 * someone who may edit a canvas asks what to draw, starts a capture, PUTs
 * its parts to R2, and finishes it. Each action checks the session here and
 * the edit access in the service. Nothing here logs a key or an upload URL.
 */

const artifactIdSchema = z.string().trim().min(1).max(200);

async function run<T>(fallback: string, action: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    return { success: true, data: await action(session.user.id) };
  } catch (error) {
    if (!(error instanceof UserFacingError) && !(error instanceof z.ZodError)) {
      console.error("[captures] Action failed", error instanceof Error ? error.name : "unknown error");
    }
    return { success: false, error: actionErrorMessage(error, fallback) };
  }
}

/** Which frames of a canvas the tab should draw now, for someone who may edit it. */
export async function frameCapturesNeededAction(artifactId: string): Promise<ActionResult<CapturesNeeded>> {
  return run("The frames to draw could not be read. Try again.", (userId) => capturesNeeded(userId, artifactIdSchema.parse(artifactId)));
}

/**
 * What a start answers: the capture and its uploads, or "not-wanted" when the
 * drawing is no longer needed (its frame changed, or another tab's image of
 * it is already current). The tab leaves a drawing that is not wanted and
 * goes on; a failed result ends its pass.
 */
export type StartCaptureAnswer = ({ state: "started" } & StartedCapture) | { state: "not-wanted" };

/** Starts a capture of one frame: checks the edit access and the limits, and returns a presigned PUT for each part. */
export async function startFrameCaptureAction(input: StartCaptureInput): Promise<ActionResult<StartCaptureAnswer>> {
  return run("The frame image could not be started. Try again.", async (userId): Promise<StartCaptureAnswer> => {
    try {
      return { state: "started", ...(await startCapture(userId, input)) };
    } catch (error) {
      if (error instanceof CaptureNotWantedError) return { state: "not-wanted" };
      throw error;
    }
  });
}

/** Checks a capture's uploaded parts and makes it the frame's current image. */
export async function finishFrameCaptureAction(captureId: string): Promise<ActionResult<{ current: boolean }>> {
  return run("The frame image could not be checked. Try again.", (userId) => finishCapture(userId, captureId));
}
