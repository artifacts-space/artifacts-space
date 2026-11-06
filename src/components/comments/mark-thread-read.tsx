"use client";

import { useEffect } from "react";

import { markThreadReadAction } from "@/app/(workspace)/threads/actions";

/** Marks the viewer's mentions on this artifact read once the thread is open. Renders nothing. */
export function MarkThreadRead({ publicId }: { publicId: string }) {
  useEffect(() => {
    markThreadReadAction(publicId).catch(() => undefined);
  }, [publicId]);
  return null;
}
