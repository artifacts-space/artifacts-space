import { afterEach, describe, expect, it, vi } from "vitest";

import { amzDate, downloadSigningTime, headObject, isR2Configured, openObject, parseEndpoint, presignDownload, presignUpload, presignUrl, r2ConfigFromEnv, r2ObjectUrl, readHeaders, readObject, readObjectStart, streamObject, type R2Config } from "./r2";

const config: R2Config = {
  accountId: "0123456789abcdef0123456789abcdef",
  bucket: "artifacts-space",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const fixedTime = new Date("2026-11-05T12:03:20.000Z");
const key = "files/7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a/report.pdf";

describe("presignUrl", () => {
  it("should match the AWS S3 presigned URL test vector when given the documented inputs", async () => {
    // From the AWS SigV4 docs: "Example: presigned URL" for GET /test.txt.
    const url = await presignUrl({
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      method: "GET",
      expiresIn: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
    });
    expect(new URL(url).searchParams.get("X-Amz-Signature")).toBe("aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  });

  it("should give the same URL when signed twice at a fixed time", async () => {
    const input = { url: r2ObjectUrl(config, key), method: "GET" as const, expiresIn: 600, now: fixedTime, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey };
    expect(await presignUrl(input)).toBe(await presignUrl(input));
  });
});

describe("presignUpload", () => {
  it("should sign the content type and length when presigning an upload", async () => {
    const upload = await presignUpload(config, { key, contentType: "application/pdf", size: 1234, expiresIn: 600, now: fixedTime });
    const url = new URL(upload.url);
    expect(url.host).toBe(`${config.accountId}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe(`/artifacts-space/${key}`);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261105T120320Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("AKIDEXAMPLE/20261105/auto/s3/aws4_request");
    expect(upload.headers).toEqual({ "Content-Type": "application/pdf", "Content-Length": "1234" });
    expect(upload.expiresAt.toISOString()).toBe("2026-11-05T12:13:20.000Z");
  });

  it("should change the signature when the declared length changes", async () => {
    const sign = async (size: number) => new URL((await presignUpload(config, { key, contentType: "application/pdf", size, expiresIn: 600, now: fixedTime })).url).searchParams.get("X-Amz-Signature");
    expect(await sign(1234)).not.toBe(await sign(1235));
  });

  it("should never put the secret key in the URL", async () => {
    const upload = await presignUpload(config, { key, contentType: "image/png", size: 10, expiresIn: 600, now: fixedTime });
    expect(upload.url).not.toContain(config.secretAccessKey);
    expect(upload.url).not.toContain(encodeURIComponent(config.secretAccessKey));
  });
});

describe("presignDownload", () => {
  it("should ask R2 for our content type and disposition when presigning a download", async () => {
    const download = await presignDownload(config, { key, contentType: "application/pdf", disposition: 'inline; filename="report.pdf"', expiresIn: 900, now: fixedTime });
    const url = new URL(download.url);
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(url.searchParams.get("response-content-disposition")).toBe('inline; filename="report.pdf"');
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261105T120000Z");
  });

  it("should reuse one URL within a five-minute window", async () => {
    const at = (time: string) => presignDownload(config, { key, contentType: "image/png", disposition: "inline", expiresIn: 900, now: new Date(time) });
    expect((await at("2026-11-05T12:00:01Z")).url).toBe((await at("2026-11-05T12:04:59Z")).url);
    expect((await at("2026-11-05T12:04:59Z")).url).not.toBe((await at("2026-11-05T12:05:00Z")).url);
  });
});

describe("helpers", () => {
  it("should format SigV4 timestamps without separators", () => {
    expect(amzDate(fixedTime)).toBe("20261105T120320Z");
    expect(downloadSigningTime(fixedTime).toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });

  it("should name every missing variable when the config is incomplete", () => {
    expect(() => r2ConfigFromEnv({ NODE_ENV: "test", R2_BUCKET: "b" })).toThrow("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  });
});

describe("isR2Configured", () => {
  const env = { NODE_ENV: "test" as const, R2_ACCOUNT_ID: "acct", R2_BUCKET: "bucket", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret" };

  it("should say storage is set up when every R2 variable has a value", () => {
    expect(isR2Configured(env)).toBe(true);
  });

  it("should say storage is not set up when any R2 variable is missing or blank, without throwing", () => {
    expect(isR2Configured({ NODE_ENV: "test" })).toBe(false);
    expect(isR2Configured({ ...env, R2_SECRET_ACCESS_KEY: "" })).toBe(false);
    expect(isR2Configured({ NODE_ENV: "test", R2_ACCOUNT_ID: "acct", R2_BUCKET: "bucket", R2_ACCESS_KEY_ID: "id" })).toBe(false);
  });
});

describe("endpoint override", () => {
  const env = { NODE_ENV: "test" as const, R2_ACCOUNT_ID: "acct", R2_BUCKET: "bucket", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret" };

  it("should use the account's R2 endpoint when no override is set", () => {
    expect(r2ObjectUrl(r2ConfigFromEnv(env), "files/a/b.png").origin).toBe("https://acct.r2.cloudflarestorage.com");
  });

  it("should use a local endpoint with the bucket in the path when one is set", () => {
    const url = r2ObjectUrl(r2ConfigFromEnv({ ...env, R2_ENDPOINT: "http://localhost:9000" }), "files/a/b.png");
    expect(url.toString()).toBe("http://localhost:9000/bucket/files/a/b.png");
  });

  it.each(["http://storage.example.com", "ftp://localhost:21", "not a url", "https://example.com/path", "https://user:pass@example.com"])("should refuse the endpoint %s", (value) => {
    expect(() => parseEndpoint(value)).toThrow();
  });

  it("should accept an https endpoint anywhere", () => {
    expect(parseEndpoint("https://eu.example.com/")).toBe("https://eu.example.com");
  });
});

describe("reads ask for the stored bytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Answers as R2 does: a text type is compressed, with no length, unless the request asks for the bytes as stored.
   * A request with a Range counts as asking: `fetch` adds `Accept-Encoding: identity` to those itself, after this
   * stand-in is called, so the stand-in cannot see it.
   */
  function likeR2(bytes: Uint8Array<ArrayBuffer>) {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>((_url, init) => {
      const sent = new Headers(init.headers);
      const range = /^bytes=0-(\d+)$/.exec(sent.get("range") ?? "");
      const stored = range !== null || sent.get("accept-encoding") === "identity";
      const body = range ? bytes.slice(0, Number(range[1]) + 1) : bytes;
      const headers: Record<string, string> = stored ? { "Content-Type": "text/css", "Content-Length": String(body.length) } : { "Content-Type": "text/css", "Content-Encoding": "gzip" };
      return Promise.resolve(new Response(init.method === "HEAD" ? null : body, { status: range ? 206 : 200, headers }));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const css = new TextEncoder().encode("body{margin:0}".repeat(20));

  it("should read the real size of a stylesheet when R2 would compress it", async () => {
    likeR2(css);
    expect(await headObject(config, key)).toEqual({ size: css.length, contentType: "text/css" });
  });

  it.each([[{}], [{ "Content-Length": "abc" }], [{ "Content-Length": "1.5" }], [{ "Content-Length": "" }]])("should give -1, never NaN, for the size of an answer with the headers %j", async (headers) => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 200, headers: { "Content-Type": "text/css", ...headers } }))));
    expect(await headObject(config, key)).toEqual({ size: -1, contentType: "text/css" });
  });

  it("should open a stylesheet with its length when R2 would compress it", async () => {
    likeR2(css);
    const opening = await openObject(config, key);
    expect(opening.state === "open" ? opening.object.length : null).toBe(css.length);
  });

  it.each([
    ["headObject", () => headObject(config, key)],
    ["openObject", () => openObject(config, key)],
    ["openObject for a HEAD", () => openObject(config, key, { head: true })],
  ])("should ask for the bytes as stored from %s, and sign the header", async (_name, read) => {
    const fetchMock = likeR2(css);
    await read();
    const headers = new Headers(fetchMock.mock.calls[0]?.[1].headers);
    expect(headers.get("accept-encoding")).toBe("identity");
    expect(headers.get("authorization")).toContain("accept-encoding");
  });

  it.each([
    ["readObjectStart", () => readObjectStart(config, key, 16)],
    ["streamObject", () => streamObject(config, key, css.length)],
    ["readObject", () => readObject(config, key, css.length)],
    ["openObject with a Range", () => openObject(config, key, { range: "bytes=0-15" })],
  ])("should leave Accept-Encoding to fetch on %s, which has a Range, so the signed header is the one sent", async (_name, read) => {
    const fetchMock = likeR2(css);
    await read();
    const headers = new Headers(fetchMock.mock.calls[0]?.[1].headers);
    expect(headers.get("range")).not.toBeNull();
    expect(headers.get("accept-encoding")).toBeNull();
    expect(headers.get("authorization")).not.toContain("accept-encoding");
  });

  it.each([[{ Range: "bytes=0-1" }], [{ range: "bytes=0-1" }]])("should add no stored-bytes header to a read whose headers are %j", (extra) => {
    expect(readHeaders(extra)).toEqual(extra);
  });

  it("should add the stored-bytes header to a read without a Range", () => {
    expect(readHeaders({})).toEqual({ "Accept-Encoding": "identity" });
  });
});

describe("streamObject", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function answer(body: Uint8Array<ArrayBuffer> | null, status: number, headers: Record<string, string> = {}) {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(body, { status, headers })));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("should stream the object with its size when it fits, asking R2 for no more than the cap plus one byte", async () => {
    const fetchMock = answer(new Uint8Array([1, 2, 3]), 206, { "Content-Length": "3" });
    const object = await streamObject(config, key, 3);
    expect(object?.size).toBe(3);
    expect(new Uint8Array(await new Response(object?.body).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Headers(fetchMock.mock.calls[0]?.[1].headers).get("range")).toBe("bytes=0-3");
  });

  it("should return null when the object does not exist", async () => {
    answer(null, 404);
    expect(await streamObject(config, key, 3)).toBeNull();
  });

  it("should refuse an object larger than the caller expects", async () => {
    answer(new Uint8Array([1, 2, 3, 4]), 206, { "Content-Length": "4" });
    await expect(streamObject(config, key, 3)).rejects.toThrow("R2 GET failed with status 413.");
  });

  it("should refuse an answer that does not say its length", async () => {
    answer(new Uint8Array([1, 2]), 200);
    await expect(streamObject(config, key, 3)).rejects.toThrow("R2 GET failed with status 413.");
  });

  it.each([[""], ["0"], ["1.5"]])("should refuse an answer whose length is %j", async (length) => {
    answer(new Uint8Array([1, 2]), 206, { "Content-Length": length });
    await expect(streamObject(config, key, 3)).rejects.toThrow("R2 GET failed with status 413.");
  });

  it("should throw without details when R2 refuses", async () => {
    answer(null, 403);
    await expect(streamObject(config, key, 3)).rejects.toThrow("R2 GET failed with status 403.");
  });
});

describe("readObject", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function answer(body: Uint8Array<ArrayBuffer> | null, status: number, headers: Record<string, string> = {}) {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(body, { status, headers })));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("should return the object's bytes and stored type when it fits, asking R2 for no more than the cap plus one byte", async () => {
    const fetchMock = answer(new Uint8Array([1, 2, 3]), 206, { "Content-Type": "image/webp" });
    expect(await readObject(config, key, 3)).toEqual({ state: "found", bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
    expect(new Headers(fetchMock.mock.calls[0]?.[1].headers).get("range")).toBe("bytes=0-3");
  });

  it("should say the object is missing when it does not exist", async () => {
    answer(null, 404);
    expect(await readObject(config, key, 3)).toEqual({ state: "missing" });
  });

  it("should never return an object larger than the caller expects", async () => {
    answer(new Uint8Array([1, 2, 3, 4]), 206, { "Content-Type": "image/webp" });
    expect(await readObject(config, key, 3)).toEqual({ state: "too-large" });
  });

  it("should throw without details when R2 refuses", async () => {
    answer(null, 403);
    await expect(readObject(config, key, 3)).rejects.toThrow("R2 GET failed with status 403.");
  });
});
