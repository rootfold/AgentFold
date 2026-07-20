import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import process from "node:process";

import type { FileSystem, FileSystemEntryType, RemoveOptions } from "./filesystem.js";

function isMissingPathError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return error.code === "ENOENT" || error.code === "ENOTDIR";
}

export class NodeFileSystem implements FileSystem {
  constructor(private readonly cwdProvider: () => string = () => process.cwd()) {}

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch (error: unknown) {
      if (isMissingPathError(error)) {
        return false;
      }

      throw error;
    }
  }

  async entryType(path: string): Promise<FileSystemEntryType | undefined> {
    try {
      const entry = await stat(path);

      if (entry.isFile()) {
        return "file";
      }

      if (entry.isDirectory()) {
        return "directory";
      }

      return "other";
    } catch (error: unknown) {
      if (isMissingPathError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async listDirectory(path: string): Promise<readonly string[]> {
    return (await readdir(path)).sort((left, right) => left.localeCompare(right));
  }

  readText(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async writeText(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf8");
  }

  async ensureDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async rename(source: string, destination: string): Promise<void> {
    await rename(source, destination);
  }

  async remove(path: string, options: RemoveOptions = {}): Promise<void> {
    await rm(path, { force: true, recursive: options.recursive ?? false });
  }

  currentWorkingDirectory(): string {
    return this.cwdProvider();
  }
}
