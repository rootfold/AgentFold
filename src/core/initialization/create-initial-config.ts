import { parseConfig } from "../config/parse-config.js";
import type { AgentFoldConfig } from "../config/types.js";
import { automationPolicyToConfig, defaultAutomationPolicy } from "../config/automation-policy.js";
import type { RepositoryMetadata } from "../scanners/types.js";

export const defaultExcludedPaths = [
  ".env",
  ".env.*",
  "**/secrets/**",
  "**/*.pem",
  "**/*.key",
  "**/credentials.json",
] as const;

function detectedPaths(metadata: RepositoryMetadata): AgentFoldConfig["paths"] {
  const paths: NonNullable<AgentFoldConfig["paths"]> = {
    ...(metadata.sourceDirectories.length === 0 ? {} : { source: metadata.sourceDirectories }),
    ...(metadata.testDirectories.length === 0 ? {} : { tests: metadata.testDirectories }),
    ...(metadata.documentationDirectories.length === 0
      ? {}
      : { documentation: metadata.documentationDirectories }),
    ...(metadata.generatedDirectories.length === 0
      ? {}
      : { generated: metadata.generatedDirectories }),
  };

  return Object.keys(paths).length === 0 ? undefined : paths;
}

export function createInitialConfig(metadata: RepositoryMetadata): AgentFoldConfig {
  const paths = detectedPaths(metadata);
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
    ...(paths === undefined ? {} : { paths }),
    state: {
      visibility: "local",
    },
    safety: {
      respect_gitignore: true,
      excluded_paths: [...defaultExcludedPaths],
    },
    automation: automationPolicyToConfig(defaultAutomationPolicy),
    adapters: {},
  };

  return parseConfig(input);
}
