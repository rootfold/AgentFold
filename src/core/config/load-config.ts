import { parse as parseYaml } from "yaml";

import type { FileSystem } from "../filesystem/filesystem.js";
import { parseConfig } from "./parse-config.js";
import type { AgentFoldConfig } from "./types.js";

export class ConfigSyntaxError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`Invalid YAML in ${path}: ${message}`);
    this.name = "ConfigSyntaxError";
  }
}

export async function loadConfig(
  fileSystem: FileSystem,
  configPath: string,
): Promise<AgentFoldConfig> {
  const source = await fileSystem.readText(configPath);
  let input: unknown;

  try {
    input = parseYaml(source.replace(/^\uFEFF/u, ""));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown YAML parsing error";
    throw new ConfigSyntaxError(configPath, message);
  }

  return parseConfig(input);
}
