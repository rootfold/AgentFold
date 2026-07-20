export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  ensureDirectory(path: string): Promise<void>;
  currentWorkingDirectory(): string;
}
