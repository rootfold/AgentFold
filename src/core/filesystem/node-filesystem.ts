import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import type { FileSystem } from "./filesystem.js";

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

  readText(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async writeText(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf8");
  }

  async ensureDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  currentWorkingDirectory(): string {
    return this.cwdProvider();
  }
}
