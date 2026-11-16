"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ArtifactDto } from "@/lib/artifact-types";

import { serverCaptureApi, type CaptureApi } from "./capture-api";
import { FrameCaptureHost } from "./frame-capture-host";

/*
 * Which capture API the /app editor's host uses. There is none by default,
 * so a fixture page draws no frame images unless it asks; the real workspace
 * page wraps itself in ServerFrameCaptures.
 */
const CaptureApiContext = createContext<CaptureApi | null>(null);

/** Gives the editors inside it a capture API: a fixture's stand-in. */
export function CaptureApiProvider({ api, children }: { api: CaptureApi; children: ReactNode }) {
  return <CaptureApiContext value={api}>{children}</CaptureApiContext>;
}

/** Turns frame captures on for the editors inside it, with the server actions. For the real workspace page, which is a server component and cannot hand over functions itself. */
export function ServerFrameCaptures({ children }: { children: ReactNode }) {
  return <CaptureApiContext value={serverCaptureApi}>{children}</CaptureApiContext>;
}

/** The capture API of this page, or null where frame images are not drawn. */
export function useCaptureApi(): CaptureApi | null {
  return useContext(CaptureApiContext);
}

/**
 * The capture host of the /app editor: on where the page turned frame
 * captures on, for an artifact that is stored. `stored` is false for the
 * blank page New artifact opens, which has nothing saved to draw.
 */
export function EditorFrameCaptures({ artifact, stored }: { artifact: Pick<ArtifactDto, "id" | "kind" | "updatedAt">; stored: boolean }) {
  const api = useCaptureApi();
  return <FrameCaptureHost artifactId={stored ? artifact.id : null} kind={artifact.kind} savedAt={artifact.updatedAt} api={api} />;
}
