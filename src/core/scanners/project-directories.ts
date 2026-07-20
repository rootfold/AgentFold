import path from "node:path";

import type { FileSystem } from "../filesystem/filesystem.js";

const sourceDirectoryCandidates = ["src", "source", "app", "lib", "packages"] as const;
const testDirectoryCandidates = ["tests", "test", "__tests__", "spec"] as const;
const documentationDirectoryCandidates = ["docs", "doc", "documentation"] as const;
const generatedDirectoryCandidates = ["dist", "build", "coverage", "out", ".next"] as const;

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
  readonly documentationDirectories: readonly string[];
  readonly generatedDirectories: readonly string[];
}> {
  const [sourceDirectories, testDirectories, documentationDirectories, generatedDirectories] =
    await Promise.all([
      existingDirectories(fileSystem, repositoryRoot, sourceDirectoryCandidates),
      existingDirectories(fileSystem, repositoryRoot, testDirectoryCandidates),
      existingDirectories(fileSystem, repositoryRoot, documentationDirectoryCandidates),
      existingDirectories(fileSystem, repositoryRoot, generatedDirectoryCandidates),
    ]);

  return {
    sourceDirectories,
    testDirectories,
    documentationDirectories,
    generatedDirectories,
  };
}
