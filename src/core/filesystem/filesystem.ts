export type FileSystemEntryType = "file" | "directory" | "other";

export interface RemoveOptions {
  readonly recursive?: boolean;
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  entryType(path: string): Promise<FileSystemEntryType | undefined>;
  listDirectory(path: string): Promise<readonly string[]>;
  realPath(path: string): Promise<string>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  writeTextAndFlush(path: string, content: string): Promise<void>;
  ensureDirectory(path: string): Promise<void>;
  link(source: string, destination: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  remove(path: string, options?: RemoveOptions): Promise<void>;
  currentWorkingDirectory(): string;
}
