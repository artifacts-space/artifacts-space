"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import type { CaptureApi } from "@/components/artifact-view/canvas/capture/capture-api";
import { FrameCaptureHost } from "@/components/artifact-view/canvas/capture/frame-capture-host";
import { ArtifactFilesProvider, type FileUrlBuilder } from "@/components/artifact-view/files-context";
import { Button } from "@/components/ui/button";
import { isPlainObject } from "@/lib/ui/json-walk";

import { captureFixtureFiles, fixtureCaptureApi, fixturePictureUrl } from "./capture-fixture-api";

const pictureUrlFor: FileUrlBuilder = (fileId) => fixturePictureUrl(fileId);

/** The canvas with the first heading of its first frame changed, as an edit to one frame would leave it. The other frames keep their content. */
function withFirstFrameChanged(content: string): string {
  const canvas: unknown = JSON.parse(content);
  if (!isPlainObject(canvas) || !Array.isArray(canvas.frames)) return content;
  const first: unknown = canvas.frames[0];
  if (!isPlainObject(first) || !isPlainObject(first.spec) || !isPlainObject(first.spec.elements)) return content;
  for (const element of Object.values(first.spec.elements)) {
    if (!isPlainObject(element) || element.type !== "Heading" || !isPlainObject(element.props)) continue;
    element.props.text = "A changed heading, much longer than the first one was";
    break;
  }
  return JSON.stringify(canvas);
}

/**
 * Development only: the canvas fixture with a capture host (`?capture=1` on
 * /dev/canvas). The host draws the fixture's frames through a stand-in API
 * (capture-fixture-api.ts) that keeps every upload in
 * `window.fixtureCaptures`. "Change the first frame" edits the canvas and
 * "Save again" only moves its save time: both are a save by this tab, which
 * the host acts on when the window next loses focus.
 */
export function CanvasCaptureFixture({ title, content: initial }: { title: string; content: string }) {
  const [content, setContent] = useState(initial);
  const [saves, setSaves] = useState(0);
  const [api, setApi] = useState<CaptureApi | null>(null);
  const newest = useRef(content);
  useEffect(() => { newest.current = content; }, [content]);
  // The stand-in lives on `window`, so it is made once the page is in the browser.
  useEffect(() => { setApi(fixtureCaptureApi(() => newest.current, captureFixtureFiles)); }, []);
  const change = useCallback(() => {
    setContent((current) => withFirstFrameChanged(current));
    setSaves((count) => count + 1);
  }, []);
  const savedAt = useMemo(() => new Date(Date.UTC(2026, 10, 1, 10, 0, saves)).toISOString(), [saves]);
  return (
    <>
      <div className="flex flex-wrap gap-2 pb-4">
        <Button variant="outline" size="sm" onClick={change}>Change the first frame</Button>
        <Button variant="outline" size="sm" onClick={() => { setSaves((count) => count + 1); }}>Save again</Button>
      </div>
      <ArtifactFilesProvider files={captureFixtureFiles} urlFor={pictureUrlFor}>
        <ArtifactView kind="canvas" content={content} title={title} />
      </ArtifactFilesProvider>
      <FrameCaptureHost artifactId="fixture-canvas" kind="canvas" savedAt={savedAt} api={api} />
    </>
  );
}
