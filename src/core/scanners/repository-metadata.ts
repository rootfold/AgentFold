import path from "node:path";

import type { FileSystem } from "../filesystem/filesystem.js";
import { scanNodeProject } from "./node-project.js";
import { detectPackageManager } from "./package-manager.js";
import { scanProjectDirectories } from "./project-directories.js";
import { scanPythonProject } from "./python-project.js";
import type { PackageManager, RepositoryMetadata } from "./types.js";

const commonScriptNames = ["dev", "build", "test", "lint", "typecheck", "format"] as const;

function scriptCommand(packageManager: PackageManager, script: string): string {
  if (packageManager === "npm") {
    return script === "test" ? "npm test" : `npm run ${script}`;
  }

  if (packageManager === "bun") {
    return `bun run ${script}`;
  }

  return `${packageManager} ${script}`;
}

function detectedCommands(
  packageManager: PackageManager | undefined,
  scripts: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  if (packageManager === undefined) {
    return {};
  }

  const commands: Record<string, string> = {
    install: `${packageManager} install`,
  };

  for (const script of commonScriptNames) {
    if (scripts[script] !== undefined) {
      commands[script] = scriptCommand(packageManager, script);
    }
  }

  return commands;
}

export async function scanRepositoryMetadata(
  fileSystem: FileSystem,
  repositoryRoot: string,
): Promise<RepositoryMetadata> {
  const [node, python, packageManagerMetadata, directories] = await Promise.all([
    scanNodeProject(fileSystem, repositoryRoot),
    scanPythonProject(fileSystem, repositoryRoot),
    detectPackageManager(fileSystem, repositoryRoot),
    scanProjectDirectories(fileSystem, repositoryRoot),
  ]);

  return {
    repositoryName: path.basename(path.resolve(repositoryRoot)),
    node,
    python,
    ...(packageManagerMetadata.packageManager === undefined
      ? {}
      : { packageManager: packageManagerMetadata.packageManager }),
    lockfiles: packageManagerMetadata.lockfiles,
    commands: detectedCommands(packageManagerMetadata.packageManager, node.scripts),
    sourceDirectories: directories.sourceDirectories,
    testDirectories: directories.testDirectories,
  };
}
