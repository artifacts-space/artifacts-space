import { AwsV4Signer } from "aws4fetch";

import { fileLimits } from "./config";

/**
 * Cloudflare R2 storage over its S3-compatible API, signed with SigV4.
 * Server only: it reads the R2 keys from the environment, and nothing here
 * may be imported by a client component. Callers pass keys made by
 * fileObjectKey; no part of a key comes straight from user input.
 */

/** Where the bucket lives and the keys that sign requests. */
export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Another S3-compatible endpoint, such as a local MinIO for end-to-end
   * tests. Unset in production, where the account's R2 endpoint is used.
   */
  endpoint?: string;
}

/** A failed R2 call. The message never includes keys or signatures. */
export class R2Error extends Error {
  readonly status: number | null;

  constructor(operation: string, status: number | null) {
    super(`R2 ${operation} failed${status === null ? "" : ` with status ${String(status)}`}.`);
    this.name = "R2Error";
    this.status = status;
  }
}

const envNames = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const;

const loopbackHosts: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The R2_ENDPOINT override, checked: an https URL, or plain http only on
 * this machine (a local MinIO for tests). Anything else is refused, so a
 * typo can never send files in the clear.
 */
export function parseEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("R2_ENDPOINT must be a URL.");
  }
  const local = url.protocol === "http:" && loopbackHosts.has(url.hostname);
  if (url.protocol !== "https:" && !local) throw new Error("R2_ENDPOINT must use https, or http on localhost.");
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("R2_ENDPOINT must be a bare origin, such as http://localhost:9000.");
  return url.origin;
}

/** Reads the R2 settings from the environment. Throws, naming the missing variables, when any is unset. */
export function r2ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2Config {
  const missing = envNames.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`File storage is not configured. Set ${missing.join(", ")}.`);
  return {
    accountId: env.R2_ACCOUNT_ID ?? "",
    bucket: env.R2_BUCKET ?? "",
    accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    ...(env.R2_ENDPOINT ? { endpoint: parseEndpoint(env.R2_ENDPOINT) } : {}),
  };
}

/** The object's URL on R2's S3 endpoint (path style), or on the configured endpoint. */
export function r2ObjectUrl(config: R2Config, key: string): URL {
  const path = key.split("/").map(encodeURIComponent).join("/");
  const origin = config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`;
  return new URL(`${origin}/${encodeURIComponent(config.bucket)}/${path}`);
}

/** SigV4's timestamp format: 20130524T000000Z. */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/** What a presigned URL needs. `region` is "auto" for R2. */
export interface PresignInput {
  url: URL;
  method: "GET" | "PUT";
  /** Headers the caller must send exactly. They are signed. */
  headers?: Record<string, string>;
  expiresIn: number;
  now: Date;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

/**
 * Signs a URL in its query string (SigV4, UNSIGNED-PAYLOAD). Every header in
 * `input.headers` is signed too, including Content-Type and Content-Length,
 * so an upload must match them exactly.
 */
export async function presignUrl(input: PresignInput): Promise<string> {
  const url = new URL(input.url);
  url.searchParams.set("X-Amz-Expires", String(input.expiresIn));
  const signer = new AwsV4Signer({
    url: url.toString(),
    method: input.method,
    headers: input.headers ?? {},
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    service: "s3",
    region: input.region ?? "auto",
    datetime: amzDate(input.now),
    signQuery: true,
    allHeaders: true,
  });
  const signed = await signer.sign();
  return signed.url.toString();
}

/** A presigned upload: PUT the bytes to `url` with exactly these headers. */
export interface PresignedUpload {
  url: string;
  method: "PUT";
  headers: { "Content-Type": string; "Content-Length": string };
  expiresAt: Date;
}

/** A presigned PUT that only accepts this exact content type and byte length. */
export async function presignUpload(
  config: R2Config,
  input: { key: string; contentType: string; size: number; expiresIn: number; now?: Date },
): Promise<PresignedUpload> {
  const now = input.now ?? new Date();
  const headers = { "Content-Type": input.contentType, "Content-Length": String(input.size) };
  const url = await presignUrl({ url: r2ObjectUrl(config, input.key), method: "PUT", headers, expiresIn: input.expiresIn, now, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey });
  return { url, method: "PUT", headers, expiresAt: new Date(now.getTime() + input.expiresIn * 1000) };
}

/** Signing time for downloads, rounded down to fileLimits.downloadSigningWindowSeconds so repeat views reuse one URL and the browser cache. */
export function downloadSigningTime(now: Date): Date {
  const window = fileLimits.downloadSigningWindowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / window) * window);
}

/**
 * A presigned GET that makes R2 answer with our content type, disposition,
 * and cache policy. The URL stays valid for at least `expiresIn` minus
 * fileLimits.downloadSigningWindowSeconds, because the signing time is rounded down.
 */
export async function presignDownload(
  config: R2Config,
  input: { key: string; contentType: string; disposition: string; expiresIn: number; now?: Date },
): Promise<{ url: string; expiresAt: Date }> {
  const signedAt = downloadSigningTime(input.now ?? new Date());
  const target = r2ObjectUrl(config, input.key);
  target.searchParams.set("response-cache-control", "private, max-age=300");
  target.searchParams.set("response-content-disposition", input.disposition);
  target.searchParams.set("response-content-type", input.contentType);
  const url = await presignUrl({ url: target, method: "GET", expiresIn: input.expiresIn, now: signedAt, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey });
  return { url, expiresAt: new Date(signedAt.getTime() + input.expiresIn * 1000) };
}

async function send(config: R2Config, operation: string, method: "HEAD" | "GET" | "DELETE" | "PUT", key: string, extra: Record<string, string> = {}, body?: Uint8Array<ArrayBuffer>): Promise<Response> {
  const signer = new AwsV4Signer({
    url: r2ObjectUrl(config, key).toString(),
    method,
    headers: extra,
    ...(body ? { body } : {}),
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const signed = await signer.sign();
  try {
    return await fetch(signed.url, { method, headers: signed.headers, cache: "no-store", ...(body ? { body } : {}) });
  } catch {
    throw new R2Error(operation, null);
  }
}

/** The stored size and type of an object, or null when it does not exist. */
export async function headObject(config: R2Config, key: string): Promise<{ size: number; contentType: string } | null> {
  const response = await send(config, "HEAD", "HEAD", key);
  if (response.status === 404) return null;
  if (!response.ok) throw new R2Error("HEAD", response.status);
  return {
    size: Number(response.headers.get("content-length") ?? "-1"),
    contentType: response.headers.get("content-type") ?? "",
  };
}

/** The first `length` bytes of an object (fewer when it is shorter). */
export async function readObjectStart(config: R2Config, key: string, length: number): Promise<Uint8Array> {
  const response = await send(config, "GET", "GET", key, { Range: `bytes=0-${String(length - 1)}` });
  if (!response.ok) throw new R2Error("GET", response.status);
  return new Uint8Array(await response.arrayBuffer()).slice(0, length);
}

/** An object opened for streaming: its body and its exact size in bytes. */
export interface ObjectStream {
  body: ReadableStream<Uint8Array>;
  size: number;
}

/**
 * Opens an object for streaming, or null when it does not exist. R2 is
 * asked for at most `maxBytes + 1` bytes (Range), and an object larger than
 * `maxBytes`, or an answer without a positive length, is refused (R2Error
 * 413), so a caller never passes on more than it expects and never holds
 * the bytes in memory. For small objects the server already checked, such
 * as team icons.
 */
export async function streamObject(config: R2Config, key: string, maxBytes: number): Promise<ObjectStream | null> {
  const response = await send(config, "GET", "GET", key, { Range: `bytes=0-${String(maxBytes)}` });
  if (response.status === 404) return null;
  if (!response.ok) throw new R2Error("GET", response.status);
  const length = response.headers.get("content-length") ?? "";
  const size = /^\d+$/.test(length) ? Number(length) : 0;
  if (!response.body || size <= 0 || size > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    // 413 (too large), not R2's own status, so a size refusal never reads as an R2 outage in the logs.
    throw new R2Error("GET", 413);
  }
  return { body: response.body, size };
}

/** Deletes an object. Deleting one that is already gone succeeds. */
export async function deleteObject(config: R2Config, key: string): Promise<void> {
  const response = await send(config, "DELETE", "DELETE", key);
  if (!response.ok && response.status !== 404) throw new R2Error("DELETE", response.status);
}

/**
 * Stores bytes the server already checked, such as a team icon. The body is
 * signed, so R2 refuses it if anything changes on the way.
 */
export async function putObject(config: R2Config, key: string, body: Uint8Array<ArrayBuffer>, contentType: string): Promise<void> {
  const response = await send(config, "PUT", "PUT", key, { "Content-Type": contentType }, body);
  if (!response.ok) throw new R2Error("PUT", response.status);
}
