export type FileSystemEntryType = "file" | "directory" | "other";

export interface RemoveOptions {
  readonly recursive?: boolean;
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  entryType(path: string): Promise<FileSystemEntryType | undefined>;
  isSymbolicLink?(path: string): Promise<boolean>;
  listDirectory(path: string): Promise<readonly string[]>;
  realPath(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  writeTextAndFlush(path: string, content: string): Promise<void>;
  writeBytesAndFlush(path: string, content: Uint8Array): Promise<void>;
  ensureDirectory(path: string): Promise<void>;
  link(source: string, destination: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  remove(path: string, options?: RemoveOptions): Promise<void>;
  currentWorkingDirectory(): string;
}
