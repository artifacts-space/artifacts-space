"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { fileUrl, type FileDto } from "@/lib/files/types";

/** Builds the URL that shows (or, with `download`, downloads) a file. */
export type FileUrlBuilder = (fileId: string, download: boolean) => string;

interface ArtifactFilesValue {
  /** The artifact's files in order, or null when the page did not say which files it has. */
  list: readonly FileDto[] | null;
  /** The same files by id. */
  files: ReadonlyMap<string, FileDto> | null;
  urlFor: FileUrlBuilder;
  /** True where pictures must load at once, not when they near the window (the frame capture box, which is never near it). */
  eager: boolean;
}

const defaultUrlFor: FileUrlBuilder = (fileId, download) => fileUrl(fileId, { download });

/** The access-checked URLs, each with its file's replace time, so a browser never opens a replaced file's old content from its redirect cache. */
function urlsFor(files: ReadonlyMap<string, FileDto> | null): FileUrlBuilder {
  if (!files) return defaultUrlFor;
  return (fileId, download) => fileUrl(fileId, { download, replacedAt: files.get(fileId)?.replacedAt });
}

const ArtifactFilesContext = createContext<ArtifactFilesValue>({ list: null, files: null, urlFor: defaultUrlFor, eager: false });

interface ArtifactFilesProviderProps {
  files: readonly FileDto[] | undefined;
  urlFor?: FileUrlBuilder | undefined;
  /** Pictures load at once, without waiting to come near the window. */
  eager?: boolean | undefined;
  children: ReactNode;
}

/**
 * Tells Image, File, and the file viewer which files the artifact holds.
 * `urlFor` replaces the access-checked /api/files URLs: the dev gallery and
 * the docs point at a stand-in picture, and the frame capture box hands over
 * the pictures its host already fetched. `eager` is for that box, which is
 * off screen, where a picture that waits to come near the window never loads.
 */
export function ArtifactFilesProvider({ files, urlFor, eager = false, children }: ArtifactFilesProviderProps) {
  const value = useMemo<ArtifactFilesValue>(
    () => {
      const byId = files ? new Map(files.map((file) => [file.id, file])) : null;
      return { list: files ?? null, files: byId, urlFor: urlFor ?? urlsFor(byId), eager };
    },
    [files, urlFor, eager],
  );
  return <ArtifactFilesContext.Provider value={value}>{children}</ArtifactFilesContext.Provider>;
}

/** What a view needs to show one file. */
export interface ArtifactFileView {
  /** The file's details, when the artifact listed them. */
  file: FileDto | null;
  /** False only when the artifact listed its files and this one is not among them. */
  attached: boolean;
  url: string;
  downloadUrl: string;
  /** True where a picture must load at once (see ArtifactFilesProvider). */
  eager: boolean;
}

/** The files of the artifact being shown, or null when the page did not list them. */
export function useArtifactFiles(): readonly FileDto[] | null {
  return useContext(ArtifactFilesContext).list;
}

/** Looks up one file of the artifact being shown. */
export function useArtifactFile(fileId: string): ArtifactFileView {
  const { files, urlFor, eager } = useContext(ArtifactFilesContext);
  const id = fileId.toLowerCase();
  const file = files?.get(id) ?? null;
  return { file, attached: files === null || file !== null, url: urlFor(id, false), downloadUrl: urlFor(id, true), eager };
}
