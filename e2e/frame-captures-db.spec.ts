import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { captureGeometry, captureObjectKeys } from "../src/lib/canvas/capture-rules";

import { cleanUp, createTestArtifact, readyDevUser } from "./support/local-db";
import { localStorageEnabled, localStorageSkipReason, storedObjectExists } from "./support/team-icon-db";
import { expect, test } from "./support/test";

/**
 * Frame captures from end to end: someone who may edit a canvas opens it,
 * and their tab draws every frame, PUTs the parts to file storage, and the
 * server checks each stored part and makes the capture current. These need
 * a local throwaway Postgres (E2E_LOCAL_DB=1) and a local S3-compatible
 * store (E2E_LOCAL_R2=1, R2_ENDPOINT on this machine) that accepts PUTs from
 * the test page's origin, and skip without them. The fixture checks
 * (frame-captures.spec.ts) read the pixels; these prove the real server
 * accepts what the tab uploads.
 */

test.skip(!localStorageEnabled(), localStorageSkipReason);

const created: string[] = [];
let pool: Pool | null = null;

function db(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

test.afterAll(async () => {
  // Captures have no link to their artifact, so they are removed here by hand; the throwaway store keeps their objects.
  if (created.length > 0) await db().query(`delete from frame_capture where artifact_id in (select id from artifact where public_id = any($1))`, [created]);
  await pool?.end();
  pool = null;
  await cleanUp(created, []);
});

const screen = (heading: string) => ({
  version: 1,
  root: "page",
  elements: {
    page: { type: "Stack", props: { gap: "lg" }, children: ["title", "copy", "action"] },
    title: { type: "Heading", props: { text: heading, level: 2 } },
    copy: { type: "Text", props: { text: "Drawn by the tab of someone who may edit this canvas." } },
    action: { type: "Button", props: { label: "Continue" } },
  },
});

const canvasOf = (heading: string) => JSON.stringify({
  version: 1,
  frames: [
    { id: "home-desktop", name: "Home, desktop", width: 1440, spec: screen(heading) },
    { id: "home-phone", name: "Home, phone", width: 390, height: 844, spec: screen(heading) },
  ],
});

interface CaptureRow {
  id: string;
  artifact_id: string;
  mode: string;
  status: string;
  part_count: number;
  width: number;
  height: number;
  content_type: string;
}

async function capturesOf(publicId: string): Promise<CaptureRow[]> {
  const result = await db().query<CaptureRow>(
    `select c.id, c.artifact_id, c.mode, c.status, c.part_count, c.width, c.height, c.content_type
     from frame_capture c join artifact a on a.id = c.artifact_id where a.public_id = $1 order by c.width, c.mode`,
    [publicId],
  );
  return result.rows;
}

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  return readyDevUser();
}

const host = (page: Page) => page.locator("[data-frame-captures]");

/** Both frames have a ready capture in each mode, with every part in storage. */
async function expectCurrentImages(publicId: string) {
  const rows = await capturesOf(publicId);
  expect(rows.map((row) => `${String(row.width)}:${row.mode}:${row.status}`)).toEqual(["390:dark:ready", "390:light:ready", "1440:dark:ready", "1440:light:ready"]);
  for (const row of rows) {
    expect(row.part_count).toBe(captureGeometry(row.width, row.height).partCount);
    expect(row.content_type).toBe("image/webp");
    for (const key of captureObjectKeys(row.artifact_id, row.id, row.part_count)) expect(await storedObjectExists(key), "the part is in storage").toBe(true);
  }
  // The phone frame asks for at least 844 pixels: its image is that tall.
  expect(rows.find((row) => row.width === 390)?.height).toBeGreaterThanOrEqual(844);
}

test.describe("frame captures with a database and file storage", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the host draws only in a window at least 640 pixels wide");
  });

  test("should draw a canvas's frames from the /app editor, and the server should accept every part", async ({ page }, testInfo) => {
    const title = `Captured in the app ${testInfo.project.name} ${String(Date.now())}`;
    const publicId = await createTestArtifact({ userId: await signIn(page), title, content: canvasOf("Welcome back"), visibility: "private", theme: null, kind: "canvas" });
    created.push(publicId);

    await page.goto(`/app?artifact=${publicId}`);
    await expect(host(page)).toHaveAttribute("data-frame-capture-passes", "1", { timeout: 60_000 });
    await expectCurrentImages(publicId);

    // Coming back to the tab asks again; nothing is needed, so nothing new is stored.
    await page.reload();
    await expect(host(page)).toHaveAttribute("data-frame-capture-passes", "1", { timeout: 60_000 });
    expect(await capturesOf(publicId)).toHaveLength(4);
  });

  test("should draw a canvas's frames from its own page for someone who may edit it, and not for a reader", async ({ page }, testInfo) => {
    const title = `Captured on its page ${testInfo.project.name} ${String(Date.now())}`;
    const publicId = await createTestArtifact({ userId: await signIn(page), title, content: canvasOf("On the page"), visibility: "public", theme: null, kind: "canvas" });
    created.push(publicId);

    await page.goto(`/artifact/${publicId}`);
    await expect(host(page)).toHaveAttribute("data-frame-capture-passes", "1", { timeout: 60_000 });
    await expectCurrentImages(publicId);

    // A reader who is not signed in gets the page with no host at all.
    await page.context().clearCookies();
    await page.goto(`/artifact/${publicId}`);
    await expect(page.locator("main h1")).toHaveText(title);
    await expect(host(page)).toHaveCount(0);
  });
});
