import { APIError } from "better-auth/api";

import { isUndeliverableSendError, UNDELIVERABLE_ADDRESS_CODE, UNDELIVERABLE_ADDRESS_MESSAGE } from "@/lib/auth/undeliverable-address";
import type { SendError } from "@/lib/sendir";

/**
 * Throws a Better Auth 422 with the stable `EMAIL_UNDELIVERABLE` code when
 * Sendir refused a send because the address cannot receive mail, so the form
 * can say so. Any other result returns, and the caller handles it as before.
 */
export function refuseUndeliverableAddress(error: SendError | null): void {
  if (!isUndeliverableSendError(error)) return;
  throw new APIError("UNPROCESSABLE_ENTITY", { code: UNDELIVERABLE_ADDRESS_CODE, message: UNDELIVERABLE_ADDRESS_MESSAGE });
}
