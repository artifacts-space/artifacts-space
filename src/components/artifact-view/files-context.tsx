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
}

const defaultUrlFor: FileUrlBuilder = (fileId, download) => fileUrl(fileId, { download });
const ArtifactFilesContext = createContext<ArtifactFilesValue>({ list: null, files: null, urlFor: defaultUrlFor });

/**
 * Tells Image, File, and the file viewer which files the artifact holds.
 * `urlFor` replaces the access-checked /api/files URLs, for the dev gallery only.
 */
export function ArtifactFilesProvider({ files, urlFor, children }: { files: readonly FileDto[] | undefined; urlFor?: FileUrlBuilder | undefined; children: ReactNode }) {
  const value = useMemo<ArtifactFilesValue>(
    () => ({ list: files ?? null, files: files ? new Map(files.map((file) => [file.id, file])) : null, urlFor: urlFor ?? defaultUrlFor }),
    [files, urlFor],
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
}

/** The files of the artifact being shown, or null when the page did not list them. */
export function useArtifactFiles(): readonly FileDto[] | null {
  return useContext(ArtifactFilesContext).list;
}

/** Looks up one file of the artifact being shown. */
export function useArtifactFile(fileId: string): ArtifactFileView {
  const { files, urlFor } = useContext(ArtifactFilesContext);
  const id = fileId.toLowerCase();
  const file = files?.get(id) ?? null;
  return { file, attached: files === null || file !== null, url: urlFor(id, false), downloadUrl: urlFor(id, true) };
}
