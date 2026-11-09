import { browserImageEnv } from "@/components/images/prepare-image";
import { centerSquare, TEAM_ICON_SIDE, TEAM_ICON_TOO_LARGE, TEAM_ICON_UPLOAD_MAX_BYTES, teamIconSourceProblem } from "@/lib/teams/team-icon-rules";

/**
 * Prepares a picked image as a team icon in the browser: decoded upright,
 * cut to its centered square, drawn at 256 x 256, and re-encoded as WebP
 * (PNG where the browser cannot write WebP). Drawing it fresh drops camera
 * data. The server checks the bytes again (team-icon-rules.ts).
 */

function encode(canvas: HTMLCanvasElement, type: "image/webp" | "image/png"): Promise<Blob | null> {
  return new Promise((resolve) => { canvas.toBlob(resolve, type, 0.9); });
}

/** WebP when the browser writes it (some only fall back to PNG), else PNG. */
async function encodeIcon(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const webp = await encode(canvas, "image/webp");
  if (webp?.type === "image/webp") return webp;
  const png = await encode(canvas, "image/png");
  return png?.type === "image/png" ? png : null;
}

/** Throws an Error written for people when the picked file cannot become the icon. */
export async function prepareTeamIcon(file: File): Promise<File> {
  const problem = teamIconSourceProblem(file);
  if (problem) throw new Error(problem);
  const image = await browserImageEnv.decode(file).catch(() => {
    throw new Error("That image could not be opened. Try another file.");
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = TEAM_ICON_SIDE;
    canvas.height = TEAM_ICON_SIDE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare images. Try another browser.");
    const crop = centerSquare(image.width, image.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image.source, crop.x, crop.y, crop.side, crop.side, 0, 0, TEAM_ICON_SIDE, TEAM_ICON_SIDE);
    const blob = await encodeIcon(canvas);
    if (!blob) throw new Error("That image could not be prepared. Try another one.");
    if (blob.size > TEAM_ICON_UPLOAD_MAX_BYTES) throw new Error(TEAM_ICON_TOO_LARGE);
    return new File([blob], blob.type === "image/webp" ? "team-icon.webp" : "team-icon.png", { type: blob.type });
  } finally {
    image.close();
  }
}
