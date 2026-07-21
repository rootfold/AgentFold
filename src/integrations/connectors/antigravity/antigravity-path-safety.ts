import path from "node:path";

import { isPathInside } from "../../../core/context/path-boundary.js";
import type { FileSystem } from "../../../core/filesystem/filesystem.js";
import {
  validateConnectorHostPath,
  validateConnectorStateBoundary as validateSharedConnectorStateBoundary,
} from "../connector-path-safety.js";

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
  await validateConnectorHostPath(fileSystem, candidatePath);
}

export async function validateConnectorStateBoundary(
  fileSystem: FileSystem,
  repositoryRoot: string,
  stateDirectory: string,
): Promise<void> {
  await validateSharedConnectorStateBoundary(fileSystem, repositoryRoot, stateDirectory);
}
