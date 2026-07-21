import { randomUUID } from "node:crypto";
import path from "node:path";

import type { FileSystem } from "./filesystem.js";
import {
  AtomicFileConflictError,
  type AtomicTextFileWriteMode,
} from "./atomic-text-file-writer.js";

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function validateTemporaryName(name: string): void {
  if (
    name.length === 0 ||
    path.isAbsolute(name) ||
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".."
  ) {
    throw new Error("Atomic temporary name must be a single relative path segment");
  }
}

export class AtomicBinaryFileWriter {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly temporaryName: (destinationName: string) => string = (destinationName) =>
      `.${destinationName}.tmp-${randomUUID()}`,
    private readonly prepareTemporary: (temporaryPath: string) => Promise<void> = () =>
      Promise.resolve(),
  ) {}

  async write(
    destination: string,
    content: Uint8Array,
    mode: AtomicTextFileWriteMode,
  ): Promise<void> {
    const directory = path.dirname(destination);
    const temporaryName = this.temporaryName(path.basename(destination));
    validateTemporaryName(temporaryName);
    const temporaryPath = path.join(directory, temporaryName);
    await this.fileSystem.ensureDirectory(directory);
    if (await this.fileSystem.exists(temporaryPath))
      throw new AtomicFileConflictError(temporaryPath);

    try {
      await this.fileSystem.writeBytesAndFlush(temporaryPath, content);
      await this.prepareTemporary(temporaryPath);
      if (mode === "create") {
        try {
          await this.fileSystem.link(temporaryPath, destination);
        } catch (error: unknown) {
          if (isAlreadyExistsError(error)) throw new AtomicFileConflictError(destination);
          throw error;
        }
        await this.fileSystem.remove(temporaryPath);
      } else {
        await this.fileSystem.rename(temporaryPath, destination);
      }
    } catch (error: unknown) {
      await this.fileSystem.remove(temporaryPath);
      throw error;
    }
  }
}
