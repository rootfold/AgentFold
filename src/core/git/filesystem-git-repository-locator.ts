import path from "node:path";

import type { FileSystem } from "../filesystem/filesystem.js";
import type { GitRepositoryLocator } from "./git-repository-locator.js";

export class FilesystemGitRepositoryLocator implements GitRepositoryLocator {
  constructor(private readonly fileSystem: FileSystem) {}

  async findRoot(startDirectory: string): Promise<string | undefined> {
    let directory = path.resolve(startDirectory);

    while (true) {
      if (await this.fileSystem.exists(path.join(directory, ".git"))) {
        return directory;
      }

      const parent = path.dirname(directory);
      if (parent === directory) {
        return undefined;
      }

      directory = parent;
    }
  }
}
