"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { unpacksAsZip } from "@/lib/page-files/zip-rules";

import type { DroppedFile } from "./dropped-files";
import { browserCanUnpack, unpackDrop, unpackFailed, type UnpackedDrop, type ZipReader } from "./unpack-drop";

/** The zip being unpacked, and how far it is, in whole percent. */
export interface Unpacking {
  name: string;
  percent: number;
}

/**
 * Unpacks the zips of drops on a web page, one drop after another, and
 * hands each unpacked drop on. While one runs, `unpacking` says which zip
 * and how far; Cancel stops the read at once and adds nothing from that
 * drop or the drops waiting behind it.
 */
export function useZipUnpack(onUnpacked: (drop: UnpackedDrop) => void, read?: ZipReader) {
  const [unpacking, setUnpacking] = useState<Unpacking | null>(null);
  const job = useRef<{ stop: AbortController; waiting: number } | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const handlers = useRef({ onUnpacked, read });
  useEffect(() => { handlers.current = { onUnpacked, read }; }, [onUnpacked, read]);
  // A section that goes away stops what it was unpacking.
  useEffect(() => () => { job.current?.stop.abort(); }, []);

  const unpack = useCallback((dropped: readonly DroppedFile[]) => {
    job.current ??= { stop: new AbortController(), waiting: 0 };
    const current = job.current;
    current.waiting += 1;
    const { signal } = current.stop;
    const stopped = () => signal.aborted;
    const run = async () => {
      if (stopped()) return;
      const onProgress = (name: string, fraction: number) => { if (!stopped()) setUnpacking({ name, percent: Math.round(fraction * 100) }); };
      onProgress(dropped.find((entry) => unpacksAsZip({ name: entry.file.name, fromFolder: entry.fromFolder }))?.file.name ?? "", 0);
      // A fault nothing else caught still ends in words: the drop's other files go on, and each zip says it could not be unpacked.
      const drop = await unpackDrop(dropped, { signal, onProgress, read: handlers.current.read, canUnpack: browserCanUnpack() }).catch(() => unpackFailed(dropped));
      if (drop && !stopped()) handlers.current.onUnpacked(drop);
    };
    const done = () => {
      current.waiting -= 1;
      if (current.waiting > 0 || job.current !== current) return;
      job.current = null;
      setUnpacking(null);
    };
    chain.current = chain.current.then(run).catch(() => undefined).finally(done);
  }, []);

  const cancel = useCallback(() => {
    job.current?.stop.abort();
    job.current = null;
    setUnpacking(null);
  }, []);

  return { unpacking, unpack, cancel };
}
