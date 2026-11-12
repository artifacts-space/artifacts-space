import type { SendError } from "@/lib/sendir";

/*
 * An address that cannot receive mail: Sendir checks the recipient's domain
 * before it sends, and answers 422 `recipient_undeliverable` when the domain
 * does not exist or has no mail server, or 422 `recipient_suppressed` when
 * the address bounced for good before. Nothing is sent either way. The
 * refusal is about the address alone, never about whether it has an
 * account. Pure, so the sign-in form and the server share it.
 */

/** The stable code a refused sign-in link or invitation carries. Clients match on it, never on message text. */
export const UNDELIVERABLE_ADDRESS_CODE = "EMAIL_UNDELIVERABLE";

/** What the server says. It never names the address, so the address never reaches a log line. */
export const UNDELIVERABLE_ADDRESS_MESSAGE = "We can't send email to this address. Check it for a typo.";

const undeliverableTypes: ReadonlySet<string> = new Set(["recipient_undeliverable", "recipient_suppressed"]);

/** True when Sendir refused the send because the address cannot receive mail. Every other failure is false. */
export function isUndeliverableSendError(error: SendError | null): boolean {
  return error?.statusCode === 422 && undeliverableTypes.has(error.name);
}

/**
 * The page's own sentence for a refusal with `code`, naming the address the
 * person typed, or null when the refusal is about something else. Render it
 * as text, never as HTML.
 */
export function undeliverableAddressMessage(code: string | undefined, address: string): string | null {
  if (code !== UNDELIVERABLE_ADDRESS_CODE) return null;
  return address ? `We can't send email to ${address}. Check it for a typo.` : UNDELIVERABLE_ADDRESS_MESSAGE;
}
