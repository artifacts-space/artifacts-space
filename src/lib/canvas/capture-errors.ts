import { UserFacingError } from "@/lib/user-facing-error";

/**
 * The drawing is no longer wanted: its frame changed, or another tab's image
 * of it is already current. The tab leaves that one drawing and goes on
 * with its pass; any other refusal of a start ends the pass.
 */
export class CaptureNotWantedError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "CaptureNotWantedError";
  }
}
