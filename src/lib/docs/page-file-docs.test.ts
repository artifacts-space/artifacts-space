import { describe, expect, it } from "vitest";

import { rateLimits } from "@/lib/abuse/limits";
import { validateArtifactContent } from "@/lib/artifact-content";
import { faultsMessage, pageBatchLimits, planPagePublish } from "@/lib/page-files/publish-rules";
import { pageFileExtensions, pageFileLimits, pageFileTypeFor, pagePathProblem } from "@/lib/page-files/rules";

import { manyFilesFlow, pageAddressLife, pageFileLimitRows, pageFilesExample, pageFileTypeRows, refusedSetExample } from "./page-file-docs";

describe("page file docs", () => {
  it("should list every extension a page file may have, once", () => {
    const listed = pageFileTypeRows().flatMap((row) => (row[0] ?? "").split(" "));
    expect(listed.sort()).toEqual(pageFileExtensions.map(({ extension }) => `.${extension}`).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("should state each limit from its constant", () => {
    const text = pageFileLimitRows().map((row) => row.join(": ")).join("\n");
    expect(text).toContain(`Page files per artifact: ${String(pageFileLimits.maxFiles)}`);
    expect(text).toContain(pageFileLimits.maxTotalBytes.toLocaleString("en-US"));
    expect(text).toContain(`${String(pageFileLimits.maxPathLength)} characters, ${String(pageFileLimits.maxDepth)} parts`);
    expect(text).toContain(`page_files_request_uploads call: ${String(pageBatchLimits.maxUploadsPerRequest)}`);
    expect(text).toContain(`page_files_publish call: ${String(pageBatchLimits.maxFilesPerPublish)}`);
    expect(text).toContain(`${rateLimits.pageFileUpload.limit.toLocaleString("en-US")} per hour`);
    expect(text).toContain(pageAddressLife);
    expect(pageAddressLife).toBe("10 to 15 minutes");
  });

  it("should give an example the server takes: a page that saves, and a set that fits an empty page", () => {
    expect(validateArtifactContent("html", pageFilesExample.document).valid).toBe(true);
    const check = planPagePublish(pageFilesExample.files.map(({ path, size }) => ({ path, size })), [], []);
    expect(check.ok).toBe(true);
    for (const file of pageFilesExample.files) {
      expect(pagePathProblem(file.path), file.path).toBeNull();
      // The document, or one of the files, names each path exactly.
      expect(`${pageFilesExample.document}\n${pageFilesExample.files.map((other) => other.content).join("\n")}`).toContain(file.path);
      // The example result names the type the server gives that path.
      expect(manyFilesFlow.result).toContain(`"Content-Type": "${pageFileTypeFor(file.path)?.contentType ?? ""}"`);
    }
  });

  it("should show a refusal in the server's own words", () => {
    const held = [{ id: "held", pagePath: "img/logo.png", size: 10 }];
    const check = planPagePublish([{ path: "about.html", size: 10 }, { path: "Img/Logo.PNG", size: 10 }], [], held);
    if (check.ok) throw new Error("The set was taken.");
    expect(refusedSetExample).toBe(faultsMessage("No upload was started. Fix these, then ask again with the whole set:", check.faults));
  });
});
