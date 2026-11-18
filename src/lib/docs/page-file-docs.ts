import { rateLimits } from "@/lib/abuse/limits";
import { fileLimits, formatBytes } from "@/lib/files/config";
import { pageBatchLimits } from "@/lib/page-files/publish-rules";
import { hiddenAllowanceWords, passRenewal } from "@/lib/page-files/renew-rules";
import { pageFileExtensions, pageFileLimits, pageHtmlType } from "@/lib/page-files/rules";
import { pageTokenLimits } from "@/lib/page-files/token";

/**
 * What the docs say about page files (the files an HTML artifact's page
 * loads by relative path), built from the constants the server enforces, so
 * the Formats, Limits, and MCP pages never state a number by hand.
 */

const n = (value: number) => value.toLocaleString("en-US");
const size = (bytes: number) => `${n(bytes)} bytes (${formatBytes(bytes)})`;
const minutes = (seconds: number) => String(seconds / 60);

/** "10 to 15 minutes": how long one files address works. */
export const pageAddressLife = `${minutes(pageTokenLimits.lifeSeconds - pageTokenLimits.stepSeconds)} to ${minutes(pageTokenLimits.lifeSeconds)} minutes`;

/** How another page of the site is served: never as HTML, only as text the frame document writes in. */
export const pageHtmlServedAs = "text/plain, written into the frame";

/** The types a page file may be: its extensions, the type it is served as, and its name. One row per served type and name. */
export function pageFileTypeRows(): string[][] {
  const rows = new Map<string, { extensions: string[]; contentType: string; label: string }>();
  for (const { extension, contentType, label } of pageFileExtensions) {
    const key = `${contentType}\n${label}`;
    const row = rows.get(key) ?? { extensions: [], contentType, label };
    row.extensions.push(`.${extension}`);
    rows.set(key, row);
  }
  return [...rows.values()].map((row) => [row.extensions.join(" "), row.contentType === pageHtmlType ? pageHtmlServedAs : row.contentType, row.label]);
}

/** Every page file limit, for the Limits page and the Formats page. */
export function pageFileLimitRows(): string[][] {
  return [
    ["Page files per artifact", String(pageFileLimits.maxFiles)],
    ["All page files of one artifact", size(pageFileLimits.maxTotalBytes)],
    ["One page file", size(fileLimits.maxBytes)],
    ["Path", `${String(pageFileLimits.maxPathLength)} characters, ${String(pageFileLimits.maxDepth)} parts (folders and the file's name)`],
    ["Uploads started by one page_files_request_uploads call", String(pageBatchLimits.maxUploadsPerRequest)],
    ["Uploads, and removals, named in one page_files_publish call", String(pageBatchLimits.maxFilesPerPublish)],
    ["Uploads waiting to finish, per person, when a call asks for a set", String(pageBatchLimits.maxPendingUploads)],
    ["Page file uploads started with page_files_request_uploads", `${n(rateLimits.pageFileUpload.limit)} per hour, per person, counted per file`],
    ["Upload URL lifetime", `${minutes(fileLimits.uploadUrlSeconds)} minutes`],
    ["A page's files address", `Works for ${pageAddressLife}. Renewed ${minutes(passRenewal.leadMs / 1000)} minutes before it ends while the page's tab is visible, and for ${hiddenAllowanceWords()} after the tab was hidden, without loading the page again.`],
  ];
}

/** The example site: the document and the three files it loads by relative path. */
export const pageFilesExample = {
  document: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Launch plan</title>
  <link rel="stylesheet" href="css/site.css">
</head>
<body>
  <h1>Launch plan</h1>
  <ul id="milestones"></ul>
  <script type="module" src="js/app.js"></script>
</body>
</html>`,
  files: [
    { path: "css/site.css", size: 1820, content: "body { font: 16px/1.5 system-ui; margin: 2rem; }" },
    { path: "js/app.js", size: 2410, content: 'const milestones = await (await fetch("data/milestones.json")).json();' },
    { path: "data/milestones.json", size: 640, content: '[{ "name": "Beta", "date": "2027-01-15" }]' },
  ],
} as const;

const exampleArtifact = "inrDvQq7HFtP44e3RFxtY7";

/** The calls that put the example's three files into the page: one to start the uploads, the PUTs, one to publish. */
export const manyFilesFlow = {
  request: JSON.stringify({ name: "page_files_request_uploads", arguments: { artifact: exampleArtifact, files: pageFilesExample.files.map(({ path, size: bytes }) => ({ path, size: bytes })) } }, null, 2),
  result: `{ "artifact": "${exampleArtifact}",
  "uploads": [
    { "path": "css/site.css", "fileId": "8c1f…", "size": 1820, "url": "https://…", "headers": { "Content-Type": "text/css", "Content-Length": "1820" } },
    { "path": "js/app.js", "fileId": "41d0…", "size": 2410, "url": "https://…", "headers": { "Content-Type": "text/javascript", "Content-Length": "2410" } },
    { "path": "data/milestones.json", "fileId": "e7a2…", "size": 640, "url": "https://…", "headers": { "Content-Type": "application/json", "Content-Length": "640" } }
  ],
  "fileIds": ["8c1f…", "41d0…", "e7a2…"], "expiresAt": "…", "put": "…", "next": "…" }`,
  put: `# Save the result as uploads.json, then, from the site's folder:
jq -r '.uploads[] | [.path, .headers["Content-Type"], .url] | @tsv' uploads.json |
  while IFS=$'\\t' read -r path type url; do
    curl -sf -X PUT -H "Content-Type: $type" --data-binary "@$path" "$url" || echo "failed: $path"
  done`,
  publish: JSON.stringify({ name: "page_files_publish", arguments: { artifact: exampleArtifact, uploads: ["8c1f…", "41d0…", "e7a2…"] } }, null, 2),
  /** A later publish that replaces one file, adds one, and removes one, together. */
  change: JSON.stringify({ name: "page_files_publish", arguments: { artifact: exampleArtifact, uploads: ["<new css/site.css>", "<img/logo.svg>"], remove: ["data/milestones.json"], baseVersion: "<from your last save>" } }, null, 2),
} as const;

/** What a refused set looks like: one error that names every file at fault. */
export const refusedSetExample = `No upload was started. Fix these, then ask again with the whole set:
- about.htm: A page of the site ends in .html: name it about.html.
- Img/Logo.PNG: The page already has img/logo.png, which differs only by upper and lower case. Use that exact path to replace it, or remove it in a call of its own first.`;
