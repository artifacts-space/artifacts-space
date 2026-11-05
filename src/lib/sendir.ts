import { z } from "zod";

/**
 * Transactional email through Sendir (sendir.ai, our own product). Every send
 * goes out as one identity, `SENDIR_IDENTITY_ID`, from that identity's own
 * address. `fromName` only sets the display name.
 */
const DEFAULT_SENDIR_URL = "https://sendir.ai";
/** A timeout may still have sent; a retry with the same idempotency key never sends twice. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}

/** `statusCode` is Sendir's HTTP status, null when no answer arrived. `name` is its error type. */
export interface SendError {
  statusCode: number | null;
  name: string;
  message: string;
}

export type SendResult = { data: { id: string }; error: null } | { data: null; error: SendError };

const sentSchema = z.object({ data: z.object({ id: z.string(), status: z.string(), error: z.string().nullish() }) });
const errorSchema = z.object({ error: z.object({ type: z.string(), message: z.string() }) });

const failure = (statusCode: number | null, name: string, message: string): SendResult => ({
  data: null,
  error: { statusCode, name, message },
});

/** True when Sendir is configured. Without it, development prints emails to the log instead. */
export function isSendirConfigured() {
  return Boolean(process.env.SENDIR_API_KEY && process.env.SENDIR_IDENTITY_ID);
}

function config() {
  const apiKey = process.env.SENDIR_API_KEY;
  const identityId = process.env.SENDIR_IDENTITY_ID;
  if (!apiKey || !identityId) throw new Error("SENDIR_API_KEY and SENDIR_IDENTITY_ID are required to send email.");
  return { apiKey, identityId, baseUrl: process.env.SENDIR_URL || DEFAULT_SENDIR_URL };
}

/**
 * A duplicate key answers 200 with the first send's state. `unknown` counts as
 * accepted: it may have gone out, and the key stops a second send.
 */
function accepted(body: unknown): SendResult {
  const parsed = sentSchema.safeParse(body);
  if (!parsed.success) return failure(null, "invalid_response", "Sendir answered without a sent message");
  const { id, status, error } = parsed.data.data;
  if (status === "sending") return failure(409, "send_in_progress", "The first send with this key is still under way");
  if (status === "failed") return failure(422, "refused", `The send was refused (${error ?? "unknown"})`);
  return { data: { id }, error: null };
}

async function answer(response: Response): Promise<SendResult> {
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return accepted(body);
  const parsed = errorSchema.safeParse(body);
  if (!parsed.success) return failure(response.status, "unexpected_response", `Sendir answered ${String(response.status)}`);
  return failure(response.status, parsed.data.error.type, parsed.data.error.message);
}

/**
 * Sends one email. Never throws for a provider or network failure: those come
 * back as `error`. An idempotency key must name exactly one email, because
 * Sendir keeps it for good.
 */
export async function sendEmail(message: EmailMessage, options: { idempotencyKey: string }): Promise<SendResult> {
  const { apiKey, identityId, baseUrl } = config();
  const body = {
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    fromName: message.fromName,
    idempotencyKey: options.idempotencyKey,
  };
  try {
    const response = await fetch(`${baseUrl}/v1/identities/${encodeURIComponent(identityId)}/sent-messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return await answer(response);
  } catch {
    return failure(null, "network_error", "Sendir could not be reached");
  }
}
