import path from "node:path";

import type { FileSystem } from "../filesystem/filesystem.js";
import { agentFoldDirectory, agentFoldPath, initializationFilePaths } from "./paths.js";

const externalInstructionFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursorrules",
] as const;

export interface InstallationInspection {
  readonly directoryExists: boolean;
  readonly configExists: boolean;
  readonly presentFiles: readonly string[];
  readonly missingFiles: readonly string[];
  readonly externalInstructionFiles: readonly string[];
}

async function detectExternalInstructionFiles(
  fileSystem: FileSystem,
  repositoryRoot: string,
): Promise<readonly string[]> {
  const fixedFiles = await Promise.all(
    externalInstructionFiles.map(async (file) => ({
      file,
      exists: await fileSystem.exists(path.join(repositoryRoot, file)),
    })),
  );
  const detected: string[] = fixedFiles.filter((entry) => entry.exists).map((entry) => entry.file);
  const cursorRulesDirectory = path.join(repositoryRoot, ".cursor", "rules");

  if ((await fileSystem.entryType(cursorRulesDirectory)) === "directory") {
    const cursorRules = (await fileSystem.listDirectory(cursorRulesDirectory))
      .filter((file) => file.toLowerCase().endsWith(".mdc"))
      .map((file) => `.cursor/rules/${file}`);
    detected.push(...cursorRules);
  }

  return detected.sort((left, right) => left.localeCompare(right));
}

export async function inspectInstallation(
  fileSystem: FileSystem,
  repositoryRoot: string,
): Promise<InstallationInspection> {
  const directoryExists =
    (await fileSystem.entryType(path.join(repositoryRoot, agentFoldDirectory))) !== undefined;
  const expectedFiles = await Promise.all(
    initializationFilePaths.map(async (relativePath) => ({
      path: agentFoldPath(relativePath),
      exists: await fileSystem.exists(path.join(repositoryRoot, agentFoldDirectory, relativePath)),
    })),
  );
  const presentFiles = expectedFiles.filter((file) => file.exists).map((file) => file.path);
  const missingFiles = expectedFiles.filter((file) => !file.exists).map((file) => file.path);

  return {
    directoryExists,
    configExists: presentFiles.includes(agentFoldPath("config.yaml")),
    presentFiles,
    missingFiles,
    externalInstructionFiles: await detectExternalInstructionFiles(fileSystem, repositoryRoot),
  };
}
