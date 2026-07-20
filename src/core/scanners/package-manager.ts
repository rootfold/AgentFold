import path from "node:path";

import type { FileSystem } from "../filesystem/filesystem.js";
import type { PackageManagerMetadata } from "./types.js";

const lockfilePackageManagers = [
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
] as const;

export async function detectPackageManager(
  fileSystem: FileSystem,
  repositoryRoot: string,
): Promise<PackageManagerMetadata> {
  const detected = await Promise.all(
    lockfilePackageManagers.map(async ([lockfile, packageManager]) => ({
      lockfile,
      packageManager,
      exists: await fileSystem.exists(path.join(repositoryRoot, lockfile)),
    })),
  );
  const matches = detected.filter((candidate) => candidate.exists);
  const firstMatch = matches[0];

  return {
    ...(firstMatch === undefined ? {} : { packageManager: firstMatch.packageManager }),
    lockfiles: matches.map((match) => match.lockfile),
  };
}
