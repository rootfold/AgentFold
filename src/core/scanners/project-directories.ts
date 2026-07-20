import path from "node:path";

import type { FileSystem } from "../filesystem/filesystem.js";

const sourceDirectoryCandidates = ["src", "source", "app", "lib", "packages"] as const;
const testDirectoryCandidates = ["tests", "test", "__tests__", "spec"] as const;

async function existingDirectories(
  fileSystem: FileSystem,
  repositoryRoot: string,
  candidates: readonly string[],
): Promise<readonly string[]> {
  const entries = await Promise.all(
    candidates.map(async (directory) => ({
      directory,
      type: await fileSystem.entryType(path.join(repositoryRoot, directory)),
    })),
  );

  return entries.filter((entry) => entry.type === "directory").map((entry) => entry.directory);
}

export async function scanProjectDirectories(
  fileSystem: FileSystem,
  repositoryRoot: string,
): Promise<{
  readonly sourceDirectories: readonly string[];
  readonly testDirectories: readonly string[];
}> {
  const [sourceDirectories, testDirectories] = await Promise.all([
    existingDirectories(fileSystem, repositoryRoot, sourceDirectoryCandidates),
    existingDirectories(fileSystem, repositoryRoot, testDirectoryCandidates),
  ]);

  return { sourceDirectories, testDirectories };
}
