import type { FileDto } from "@/lib/files/types";
import { fixtureFiles } from "@/lib/ui/fixtures/components";

/**
 * Development only: the gallery's stand-ins for uploaded files. The gallery
 * uploads nothing, so every file shows a data URL instead. Images and PDFs
 * show a small SVG; in the Media blocks group, video and audio play a quarter
 * second of silent WAV, so their players reach the ready state as a real file
 * would. Data URLs, not files on this site: the site sends frame-ancestors
 * 'none' (src/lib/security-header-rules.ts), so a PDF iframe pointed at a site
 * path would be blocked, while the real viewer frames /api/files, which allows it.
 */

export const mediaVideoFile: FileDto = { id: "00000000-0000-4000-8000-000000000004", filename: "walkthrough.mp4", contentType: "video/mp4", size: 9_400_000, createdAt: "2026-11-05T00:00:00.000Z" };
export const mediaAudioFile: FileDto = { id: "00000000-0000-4000-8000-000000000005", filename: "interview.wav", contentType: "audio/wav", size: 1_200_000, createdAt: "2026-11-05T00:00:00.000Z" };

/** The gallery's fixture files, plus a video and a recording. */
export const mediaFixtureFiles: FileDto[] = [...fixtureFiles, mediaVideoFile, mediaAudioFile];

/** The image and PDF stand-in: a faint 4:3 rectangle. */
export const imageStandIn = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill-opacity='.08'/%3E%3C/svg%3E";

/** A quarter second of 8 kHz, 8-bit mono silence as a WAV data URL. */
function silentWav(): string {
  const samples = 2000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[at + index] = value.charCodeAt(index);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

const playableStandIn = silentWav();
const playableIds: ReadonlySet<string> = new Set([mediaVideoFile.id, mediaAudioFile.id]);

/** The stand-in URL for one of the gallery's media files. */
export function mediaStandInUrl(fileId: string): string {
  return playableIds.has(fileId) ? playableStandIn : imageStandIn;
}
