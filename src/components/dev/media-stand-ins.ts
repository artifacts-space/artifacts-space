import type { FileDto } from "@/lib/files/types";
import { fixtureFiles } from "@/lib/ui/fixtures/components";

/**
 * Development only: the gallery's stand-ins for uploaded files. The gallery
 * uploads nothing, so every file shows a data URL instead. Images and PDFs
 * show a small SVG; in the Media blocks group, the video plays a 16 by 9 pixel
 * VP8 WebM and the recording a quarter second of silent WAV, so both players
 * reach the ready state as a real file would. Data URLs, not files on this site: the site sends frame-ancestors
 * 'none' (src/lib/security-header-rules.ts), so a PDF iframe pointed at a site
 * path would be blocked, while the real viewer frames /api/files, which allows it.
 */

export const mediaVideoFile: FileDto = { id: "00000000-0000-4000-8000-000000000004", filename: "walkthrough.webm", contentType: "video/webm", size: 9_400_000, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null };
export const mediaAudioFile: FileDto = { id: "00000000-0000-4000-8000-000000000005", filename: "interview.wav", contentType: "audio/wav", size: 1_200_000, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null };

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

/** A grey 16 by 9 pixel VP8 WebM, under half a second, recorded once from a canvas in Chromium. */
const videoStandIn = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAF5EU2bdLlNu4tTq4QVSalmU6yBbk27i1OrhBZUrmtTrIGTTbuLU6uEH0O2dVOsgdRNu4xTq4QcU7trU6yCAWfsrgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBEiYRDSNvnTYCGQ2hyb21lV0GGQ2hyb21lFlSua7yuuteBAXPFh7CZCCZtlBqDgQFV7oEBhoVWX1ZQOOCdsIEQuoEJU8CBAVWwkFWxgQFVuYECVbqBDVW7gQEfQ7Z1AQAAAAAAAIfngQCgyqGfgQAAABACAJ0BKhAACQAABwiFhYiZhIgBJBAAMMtAAHWhpqak7oEBpZ8QAgCdASoQAAkAAYcIhYWImYSICAIADA1gAP7+TeAAoLahloEAyADRAQAAEA0QAMAAwsF/oABAAAB1oZimlu6BAaWRsQEABhBcABgAGFgv9AAIAAD7gQAcU7trjbuLs4EAt4b3gQHxgdQ=";
const audioStandIn = silentWav();

/** The stand-in URL for one of the gallery's media files. */
export function mediaStandInUrl(fileId: string): string {
  if (fileId === mediaVideoFile.id) return videoStandIn;
  if (fileId === mediaAudioFile.id) return audioStandIn;
  return imageStandIn;
}
