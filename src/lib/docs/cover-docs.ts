import { artifactCoverLimits } from "@/lib/covers/limits";
import { COVER_MAX_BYTES } from "@/lib/files/cover-rules";

/**
 * Examples and tables for the Covers section of the themes docs page. Kept
 * here so tests can prove that every example is what the server accepts.
 */

const exampleId = "Vq3kJ0pXw2mZ8rT5yN1aBc";
const exampleFile = "0f8fad5b-d9cb-469f-a165-70867728950e";

/** Ready-to-copy MCP calls: a gradient on create, an image with a focal point, moving the focal point, and removing the cover. */
export const coverMcpExamples = {
  createWithGradient: JSON.stringify(
    { name: "artifacts_create", arguments: { title: "Q3 launch plan", kind: "markdown", content: "# Q3 launch plan\n\n…", theme: "paper", cover: "dawn" } },
    null,
    2,
  ),
  updateWithImage: JSON.stringify({ name: "artifacts_update", arguments: { id: exampleId, cover: `file:${exampleFile}`, coverPosition: 30 } }, null, 2),
  reposition: JSON.stringify({ name: "artifacts_update", arguments: { id: exampleId, coverPosition: 60 } }, null, 2),
  clear: JSON.stringify({ name: "artifacts_update", arguments: { id: exampleId, cover: null } }, null, 2),
};

/** The rules a cover image must meet. */
export const coverImageRows: [string, string][] = [
  ["Types", "PNG, JPEG, GIF, WebP, or AVIF. SVG is refused, because it can carry script."],
  ["Size", `At most ${String(COVER_MAX_BYTES / 1_048_576)} MB. A bigger file is refused with an error, and nothing is saved. Wide images look best; about 2400 px wide is plenty.`],
  ["Link previews", `Draw only JPEG and PNG covers of at most ${String(COVER_MAX_BYTES / 1_048_576)} MB. Agents: resize and save as JPEG before you upload. In the web app, Upload an image does this for you.`],
  ["Owner", "Your own finished upload, or a file already attached to this artifact. A file attached to another artifact is refused."],
  ["Source", "Uploads only. Remote URLs are refused."],
  ["coverPosition", "0 (top) to 100 (bottom). 50, the centre, is the default."],
  ["Stored value", `At most ${String(artifactCoverLimits.maxStoredChars)} characters, such as "mist" or "file:<id>@30".`],
];
