import { parseConfig } from "../config/parse-config.js";
import type { AgentFoldConfig } from "../config/types.js";
import type { RepositoryMetadata } from "../scanners/types.js";

export const defaultExcludedPaths = [
  ".env",
  ".env.*",
  "**/secrets/**",
  "**/*.pem",
  "**/*.key",
  "**/credentials.json",
] as const;

export function createInitialConfig(metadata: RepositoryMetadata): AgentFoldConfig {
  const input: unknown = {
    version: 1,
    project: {
      name: metadata.repositoryName,
      summary: "",
    },
    runtime: {
      node: metadata.node.nodeVersion ?? ">=20",
    },
    ...(metadata.packageManager === undefined ? {} : { package_manager: metadata.packageManager }),
    commands: metadata.commands,
    state: {
      visibility: "local",
    },
    safety: {
      respect_gitignore: true,
      excluded_paths: [...defaultExcludedPaths],
    },
    adapters: {},
  };

  return parseConfig(input);
}
