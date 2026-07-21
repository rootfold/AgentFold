import path from "node:path";

import { isPathInside } from "../../core/context/path-boundary.js";
import type { FileSystem } from "../../core/filesystem/filesystem.js";

export async function validateConnectorHostPath(
  fileSystem: FileSystem,
  candidatePath: string,
): Promise<void> {
  if (fileSystem.isSymbolicLink === undefined) {
    throw new Error("Symbolic-link inspection is unavailable for the connector target.");
  }
  let inspected = candidatePath;
  while (true) {
    if ((await fileSystem.exists(inspected)) && (await fileSystem.isSymbolicLink(inspected))) {
      throw new Error("A connector target resolves through a symbolic link.");
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
  await validateConnectorHostPath(fileSystem, stateDirectory);
  if (await fileSystem.exists(stateDirectory)) {
    const realRepository = await fileSystem.realPath(repositoryRoot);
    const realState = await fileSystem.realPath(stateDirectory);
    if (isPathInside(realRepository, realState)) {
      throw new Error("Connector state resolves inside the repository.");
    }
  }
}

export async function validateRepositoryFileBoundary(
  fileSystem: FileSystem,
  repositoryRoot: string,
  filePath: string,
): Promise<void> {
  const realRoot = await fileSystem.realPath(repositoryRoot);
  if (!isPathInside(repositoryRoot, filePath)) {
    throw new Error("The connector-owned repository file escapes the repository.");
  }
  let inspected = filePath;
  while (isPathInside(repositoryRoot, inspected)) {
    if (await fileSystem.exists(inspected)) {
      if (fileSystem.isSymbolicLink === undefined) {
        throw new Error("Symbolic-link inspection is unavailable for the repository target.");
      }
      if (await fileSystem.isSymbolicLink(inspected)) {
        throw new Error("The connector-owned repository file resolves through a symbolic link.");
      }
      const realCandidate = await fileSystem.realPath(inspected);
      if (!isPathInside(realRoot, realCandidate)) {
        throw new Error("The connector-owned repository file resolves outside the repository.");
      }
    }
    if (inspected === repositoryRoot) break;
    const parent = path.dirname(inspected);
    if (parent === inspected) break;
    inspected = parent;
  }
}
