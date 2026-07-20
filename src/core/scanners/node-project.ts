import path from "node:path";

import type { FileSystem } from "../filesystem/filesystem.js";
import type { NodeProjectMetadata } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export async function scanNodeProject(
  fileSystem: FileSystem,
  repositoryRoot: string,
): Promise<NodeProjectMetadata> {
  const packagePath = path.join(repositoryRoot, "package.json");

  if (!(await fileSystem.exists(packagePath))) {
    return { present: false, scripts: {} };
  }

  const source = await fileSystem.readText(packagePath);
  const input: unknown = JSON.parse(source.replace(/^\uFEFF/u, ""));
  const packageJson = isRecord(input) ? input : {};
  const engines = isRecord(packageJson.engines) ? packageJson.engines : {};

  return {
    present: true,
    ...(typeof engines.node === "string" && engines.node.trim().length > 0
      ? { nodeVersion: engines.node.trim() }
      : {}),
    scripts: stringRecord(packageJson.scripts),
  };
}
