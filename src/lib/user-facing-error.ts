/**
 * An error whose message is written for the person or agent who caused it and
 * is safe to show as is. Anything else is reported with a generic message.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
