import path from "node:path";

import { isPathInside } from "../../../core/context/path-boundary.js";
import type { FileSystem } from "../../../core/filesystem/filesystem.js";

export async function validateAntigravityRuleBoundary(
  fileSystem: FileSystem,
  repositoryRoot: string,
  rulePath: string,
): Promise<void> {
  const realRoot = await fileSystem.realPath(repositoryRoot);
  if (!isPathInside(repositoryRoot, rulePath)) {
    throw new Error("The workspace rule escapes the repository.");
  }
  for (const candidate of [
    path.dirname(path.dirname(rulePath)),
    path.dirname(rulePath),
    rulePath,
  ]) {
    if (!(await fileSystem.exists(candidate))) continue;
    const realCandidate = await fileSystem.realPath(candidate);
    if (!isPathInside(realRoot, realCandidate)) {
      throw new Error("The workspace rule path resolves outside the repository.");
    }
  }
}

export async function validateAntigravityHostConfigPath(
  fileSystem: FileSystem,
  candidatePath: string,
): Promise<void> {
  let inspected = candidatePath;
  while (true) {
    if (await fileSystem.exists(inspected)) {
      if (fileSystem.isSymbolicLink === undefined) {
        throw new Error("Symbolic-link inspection is unavailable for the configuration target.");
      }
      if (await fileSystem.isSymbolicLink(inspected)) {
        throw new Error("An Antigravity configuration target resolves through a symbolic link.");
      }
    }
    const parent = path.dirname(inspected);
    if (parent === inspected) return;
    inspected = parent;
  }
}

export async function validateConnectorStateBoundary(
  fileSystem: FileSystem,
  repositoryRoot: string,
  stateDirectory: string,
): Promise<void> {
  if (isPathInside(repositoryRoot, stateDirectory)) {
    throw new Error("Connector state cannot be stored in the repository.");
  }
  await validateAntigravityHostConfigPath(fileSystem, stateDirectory);
  if (await fileSystem.exists(stateDirectory)) {
    const realRepository = await fileSystem.realPath(repositoryRoot);
    const realState = await fileSystem.realPath(stateDirectory);
    if (isPathInside(realRepository, realState)) {
      throw new Error("Connector state resolves inside the repository.");
    }
  }
}
