/*
 * The files of a drop or a pick, with where each sits in it: a folder
 * dropped on the page is read through the browser's file system entries
 * (webkitGetAsEntry), and a folder picked with a folder picker comes with
 * each file's `webkitRelativePath`. A file dropped or picked by itself sits
 * at its own name.
 */

/** One file of a drop or pick, and its place in it. */
export interface DroppedFile {
  file: File;
  /** "site/css/site.css" for a file in a dropped or picked folder, its own name otherwise. */
  relativePath: string;
  /** True when the file came out of a folder. */
  fromFolder: boolean;
}

/** Most files read out of the folders of one drop. A page holds far fewer; reading stops here so a huge folder cannot hold the tab. */
export const maxFilesReadFromDrop = 1000;

/** A file as a drop holds it, with its place: a picked folder's files carry their path in the folder. */
export function asDropped(file: File): DroppedFile {
  const inFolder = file.webkitRelativePath;
  return inFolder ? { file, relativePath: inFolder, fromFolder: true } : { file, relativePath: file.name, fromFolder: false };
}

/** The parts of the browser's file system entries this reads, so a test can hand in its own. */
export interface EntryLike {
  name: string;
  fullPath: string;
  isFile: boolean;
  isDirectory: boolean;
}
interface FileEntryLike extends EntryLike {
  file: (done: (file: File) => void, failed?: (error: unknown) => void) => void;
}
interface FolderEntryLike extends EntryLike {
  createReader: () => { readEntries: (done: (entries: EntryLike[]) => void, failed?: (error: unknown) => void) => void };
}

function isFileEntry(entry: EntryLike): entry is FileEntryLike {
  return entry.isFile && "file" in entry;
}

function isFolderEntry(entry: EntryLike): entry is FolderEntryLike {
  return entry.isDirectory && "createReader" in entry;
}

function fileOf(entry: FileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => { entry.file(resolve, reject); });
}

/** Every entry in a folder: the reader hands them over in batches until it hands over none. */
async function entriesIn(folder: FolderEntryLike): Promise<EntryLike[]> {
  const reader = folder.createReader();
  const all: EntryLike[] = [];
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) => { reader.readEntries(resolve, reject); });
    if (batch.length === 0 || all.length >= maxFilesReadFromDrop) return all;
    all.push(...batch);
  }
}

/**
 * Reads the files under the dropped entries, depth first in the order the
 * browser gives, each with its path from the top of the drop. Stops after
 * maxFilesReadFromDrop files. An entry that cannot be read is skipped.
 */
export async function filesUnder(entries: readonly EntryLike[]): Promise<DroppedFile[]> {
  const found: DroppedFile[] = [];
  const walk = async (entry: EntryLike, inFolder: boolean): Promise<void> => {
    if (found.length >= maxFilesReadFromDrop) return;
    if (isFileEntry(entry)) {
      const file = await fileOf(entry).catch(() => null);
      if (file) found.push({ file, relativePath: entry.fullPath.replace(/^\/+/, "") || entry.name, fromFolder: inFolder });
      return;
    }
    if (!isFolderEntry(entry)) return;
    const children = await entriesIn(entry).catch(() => []);
    for (const child of children) await walk(child, true);
  };
  for (const entry of entries) await walk(entry, false);
  return found;
}

/**
 * Starts reading what a drop carries. Call it inside the drop event: the
 * browser hands out a drop's entries only then. A drop that holds a folder
 * is read through its entries; any other drop is its files, as dropped.
 */
export function readDrop(data: DataTransfer | null): Promise<DroppedFile[]> {
  const files = Array.from(data?.files ?? []);
  const items = Array.from(data?.items ?? []).filter((item) => item.kind === "file");
  const entries = items.flatMap((item) => {
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    return entry ? [entry] : [];
  });
  if (!entries.some((entry) => entry.isDirectory)) return Promise.resolve(files.map(asDropped));
  return filesUnder(entries).catch(() => files.map(asDropped));
}
