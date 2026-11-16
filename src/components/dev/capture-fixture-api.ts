import type { CaptureApi } from "@/components/artifact-view/canvas/capture/capture-api";
import type { NeededFrame } from "@/lib/canvas/captures";
import { captureHashInput, captureLimits, captureModes, captureModesFor, type CaptureDrawing, type CaptureMode } from "@/lib/canvas/capture-rules";
import { frameSpecText } from "@/lib/canvas/read";
import { validateCanvas } from "@/lib/canvas/validate";
import { fileRefsInContent } from "@/lib/files/refs";
import type { FileDto } from "@/lib/files/types";
import { siteDefaultTheme } from "@/lib/themes/resolve";

/**
 * The stand-in capture API of the /dev/canvas fixture (`?capture=1`): what
 * the server would answer, worked out in the page from the fixture's canvas,
 * with no database and no file storage. It keeps what the host "uploads" in
 * `window.fixtureCaptures`, so a test can read each part's bytes.
 */

/** The fixture's files: two pictures a frame can show. Their content is the site icon. */
export const captureFixtureFiles: readonly FileDto[] = [
  { id: "11111111-1111-4111-8111-111111111111", filename: "team.png", contentType: "image/png", size: 2048, createdAt: "2026-11-01T10:00:00.000Z", replacedAt: null },
  { id: "22222222-2222-4222-8222-222222222222", filename: "office.png", contentType: "image/png", size: 4096, createdAt: "2026-11-01T10:00:00.000Z", replacedAt: null },
];

/** One capture the fixture's host made. */
export interface FixtureCapture {
  id: string;
  frameHash: string;
  mode: CaptureMode;
  /** The ids of the frames that have this content. */
  frames: string[];
  /** The frame's width, and the full height the host reported. */
  width: number;
  height: number;
  partial: boolean;
  contentType: string;
  /** Each part as a data URL, in order. Empty until uploaded. */
  parts: string[];
  /** True once finished: the image is the content's current one. */
  current: boolean;
}

/** What the fixture's stand-in has seen. */
export interface FixtureCaptures {
  captures: FixtureCapture[];
  /** How many times the host asked which drawings are needed. */
  neededCalls: number;
}

declare global {
  interface Window {
    /** What the capture host of /dev/canvas?capture=1 uploaded (capture-fixture-api.ts). */
    fixtureCaptures?: FixtureCaptures;
  }
}

/** The picture every fixture file stands in for. `?file=` lets a test fail one file's fetch by its URL. */
export function fixturePictureUrl(fileId: string): string {
  return `/artifacts-space-icon.png?file=${encodeURIComponent(fileId)}`;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(typeof reader.result === "string" ? reader.result : ""); };
    reader.onerror = () => { reject(new Error("The part could not be read.")); };
    reader.readAsDataURL(blob);
  });
}

interface FixtureFrame extends NeededFrame {
  ids: string[];
}

/** The fixture's board as the server would read it: each frame that can be drawn, hashed in both modes. Frames with the same content share one entry. */
async function readBoard(content: string, files: readonly FileDto[]): Promise<FixtureFrame[]> {
  const canvas = validateCanvas(content);
  if (!canvas.renderable) return [];
  const withErrors = new Set(canvas.issues.flatMap((issue) => (issue.severity === "error" && issue.frameId !== undefined ? [issue.frameId] : [])));
  const attached = new Set(files.map((file) => file.id));
  const theme = siteDefaultTheme();
  const frames = new Map<string, FixtureFrame>();
  for (const frame of canvas.frames) {
    const spec = frameSpecText(frame);
    if (withErrors.has(frame.id) || frame.spec === null || spec === null) continue;
    const named = fileRefsInContent("ui", spec).map((id) => ({ id, attached: attached.has(id) }));
    const drawings: CaptureDrawing[] = [];
    for (const mode of captureModesFor(theme.mode)) {
      const input = captureHashInput({ width: frame.width, height: frame.height, padding: frame.padding, spec: frame.spec, theme, mode, files: named });
      if (input !== null) drawings.push({ frameHash: await sha256(input), mode });
    }
    const key = drawings.map((drawing) => drawing.frameHash).join(":");
    const same = frames.get(key);
    if (same) same.ids.push(frame.id);
    else frames.set(key, { width: frame.width, height: frame.height, padding: frame.padding, spec, drawings, ids: [frame.id] });
  }
  return [...frames.values()];
}

/**
 * Builds the stand-in. `content` reads the fixture's canvas as it is now,
 * so a change in the page is "the newest saved content" on the next call.
 */
export function fixtureCaptureApi(content: () => string, files: readonly FileDto[]): CaptureApi {
  const seen: FixtureCaptures = { captures: [], neededCalls: 0 };
  window.fixtureCaptures = seen;
  const isCurrent = (drawing: CaptureDrawing) => seen.captures.some((capture) => capture.current && capture.frameHash === drawing.frameHash && capture.mode === drawing.mode);
  let count = 0;
  return {
    needed: async () => {
      seen.neededCalls += 1;
      const board = await readBoard(content(), files);
      const frames: NeededFrame[] = [];
      let drawings = 0;
      // Light drawings first, at most one batch, as the server answers.
      for (const mode of captureModes) {
        for (const frame of board) {
          const wanted = frame.drawings.filter((drawing) => drawing.mode === mode && !isCurrent(drawing));
          if (wanted.length === 0 || drawings >= captureLimits.batchDrawings) continue;
          drawings += wanted.length;
          const listed = frames.find((candidate) => candidate.spec === frame.spec && candidate.width === frame.width && candidate.padding === frame.padding && candidate.height === frame.height);
          if (listed) listed.drawings.push(...wanted);
          else frames.push({ width: frame.width, height: frame.height, padding: frame.padding, spec: frame.spec, drawings: wanted });
        }
      }
      return { success: true, data: { state: "draw", theme: siteDefaultTheme(), files: [...files], frames } };
    },
    start: async (input) => {
      const board = await readBoard(content(), files);
      const frame = board.find((candidate) => candidate.drawings.some((drawing) => drawing.frameHash === input.frameHash && drawing.mode === input.mode));
      if (!frame || isCurrent(input)) return { success: true, data: { state: "not-wanted" } };
      count += 1;
      const id = `fixture-capture-${String(count)}`;
      seen.captures.push({ id, frameHash: input.frameHash, mode: input.mode, frames: frame.ids, width: frame.width, height: input.height, partial: input.partial, contentType: input.parts[0]?.contentType ?? "", parts: [], current: false });
      return { success: true, data: { state: "started", captureId: id, uploads: input.parts.map((_part, index) => ({ url: `${id}/${String(index + 1)}`, headers: {} })) } };
    },
    upload: async (upload, part) => {
      const [id, place] = upload.url.split("/");
      const capture = seen.captures.find((candidate) => candidate.id === id);
      if (!capture) return false;
      try {
        capture.parts[Number(place) - 1] = await asDataUrl(part);
        return true;
      } catch {
        return false;
      }
    },
    finish: (captureId) => {
      const capture = seen.captures.find((candidate) => candidate.id === captureId);
      if (!capture) return Promise.resolve({ success: false, error: "Frame image not found." });
      // As the server does: this capture becomes the content's current image, and any other of the same content stops being it.
      for (const other of seen.captures) if (other.frameHash === capture.frameHash && other.mode === capture.mode) other.current = false;
      capture.current = true;
      return Promise.resolve({ success: true, data: { current: true } });
    },
    pictureUrl: (file) => fixturePictureUrl(file.id),
  };
}
