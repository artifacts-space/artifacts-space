import type { PresignedUpload } from "@/lib/files/r2";

/**
 * An in-memory stand-in for R2, for frame capture tests: the R2 calls the
 * capture code makes, answered from a map. A test "uploads" a part by
 * putting it in `objects`.
 */

/** One stored object: its size, its type, and its first bytes. */
export interface FakeObject {
  size: number;
  contentType: string;
  start: Uint8Array;
}

/** The first bytes of a WebP (the extended form) of this pixel size. */
export function webpStart(width: number, height: number): Uint8Array {
  const three = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
  const text = (value: string) => Array.from(new TextEncoder().encode(value));
  return Uint8Array.from([...text("RIFF"), 0, 0, 0, 0, ...text("WEBPVP8X"), 10, 0, 0, 0, 0, 0, 0, 0, ...three(width - 1), ...three(height - 1)]);
}

/** The first bytes of a JPEG of this pixel size: JFIF, then the frame header. */
export function jpegStart(width: number, height: number): Uint8Array {
  const jfif = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  return Uint8Array.from([...jfif, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03]);
}

/** The first bytes of a PNG, which is what a browser hands back when it cannot encode WebP. */
export function pngStart(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 5, 0xa0, 0, 0, 3, 0x48, 8, 6, 0, 0, 0]);
}

/** A fake bucket and the r2.ts functions that read and write it. */
export function fakeCaptureBucket() {
  const objects = new Map<string, FakeObject>();
  /** Turn on to make every delete fail, as R2 does in an outage. */
  const state = { deletesFail: false, configured: true };
  const deleted: string[] = [];
  const presigned: { key: string; contentType: string; size: number; expiresIn: number }[] = [];
  const r2 = {
    isR2Configured: () => state.configured,
    r2ConfigFromEnv: () => ({ accountId: "test", bucket: "test", accessKeyId: "test", secretAccessKey: "test" }),
    presignUpload: (_config: unknown, input: { key: string; contentType: string; size: number; expiresIn: number }): Promise<PresignedUpload> => {
      presigned.push(input);
      return Promise.resolve({ url: `https://r2.test/${input.key}`, method: "PUT", headers: { "Content-Type": input.contentType, "Content-Length": String(input.size) }, expiresAt: new Date(0) });
    },
    headObject: (_config: unknown, key: string) => {
      const object = objects.get(key);
      return Promise.resolve(object ? { size: object.size, contentType: object.contentType } : null);
    },
    readObjectStart: (_config: unknown, key: string, length: number) => Promise.resolve((objects.get(key)?.start ?? new Uint8Array()).slice(0, length)),
    deleteObject: (_config: unknown, key: string) => {
      if (state.deletesFail) return Promise.reject(new Error("R2 DELETE failed."));
      objects.delete(key);
      deleted.push(key);
      return Promise.resolve();
    },
  };
  return { objects, state, deleted, presigned, r2 };
}
