/**
 * An error whose message is written for the person or agent who caused it and
 * is safe to show as is. Anything else is reported with a generic message.
 * `personMessage`, when set, is what the web app shows instead: the message
 * may name MCP tools or ids that mean nothing to a person.
 */
export class UserFacingError extends Error {
  readonly personMessage: string | undefined;

  constructor(message: string, personMessage?: string) {
    super(message);
    this.name = "UserFacingError";
    this.personMessage = personMessage;
  }
}
