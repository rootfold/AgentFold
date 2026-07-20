import type { AgentFoldConfig } from "../config/types.js";
import type { RepositoryMetadata } from "../scanners/types.js";

export interface ContextTemplates {
  readonly "context/project.md": string;
  readonly "context/architecture.md": string;
  readonly "context/commands.md": string;
  readonly "context/conventions.md": string;
  readonly "context/safety.md": string;
}

function markdownList(items: readonly string[], emptyMessage: string): string {
  return items.length === 0
    ? `- _${emptyMessage}_`
    : items.map((item) => `- \`${item}\``).join("\n");
}

function detectedStack(metadata: RepositoryMetadata): readonly string[] {
  const stack: string[] = [];

  if (metadata.node.present) {
    stack.push(`Node.js (${metadata.node.nodeVersion ?? "version not declared"})`);
  }

  if (metadata.python.present) {
    stack.push(`Python (${metadata.python.markerFiles.join(", ")})`);
  }

  if (metadata.packageManager !== undefined) {
    stack.push(`${metadata.packageManager} package manager`);
  }

  return stack;
}

function commandTable(commands: Readonly<Record<string, string>>): string {
  const entries = Object.entries(commands);

  if (entries.length === 0) {
    return "_No commands were detected._";
  }

  return [
    "| Purpose | Command |",
    "| --- | --- |",
    ...entries.map(([purpose, command]) => `| ${purpose} | \`${command}\` |`),
  ].join("\n");
}

export function createContextTemplates(
  config: AgentFoldConfig,
  metadata: RepositoryMetadata,
): ContextTemplates {
  return {
    "context/project.md": `# Project\n\n## Name\n\n${config.project.name}\n\n## Purpose\n\n<!-- Describe why this project exists. -->\n\n## Target users\n\n<!-- Describe the primary users. -->\n\n## Scope\n\n<!-- Describe what is in and out of scope. -->\n\n## Detected stack\n\n${markdownList(detectedStack(metadata), "No stack markers detected")}\n`,
    "context/architecture.md": `# Architecture\n\n## Source directories\n\n${markdownList(metadata.sourceDirectories, "No common source directories detected")}\n\n## Test directories\n\n${markdownList(metadata.testDirectories, "No common test directories detected")}\n\n## High-level components\n\n<!-- Describe the main components and their responsibilities. -->\n\n## Data flow\n\n<!-- Describe important data flows and boundaries. -->\n\n## Architecture constraints\n\n<!-- Record constraints that future changes must preserve. -->\n`,
    "context/commands.md": `# Commands\n\n## Detected commands\n\n${commandTable(config.commands)}\n\n## Additional commands\n\n<!-- Add useful commands that could not be detected safely. -->\n`,
    "context/conventions.md": `# Conventions\n\n## Language conventions\n\n<!-- Record language and formatting conventions. -->\n\n## Naming\n\n<!-- Record naming rules. -->\n\n## Testing expectations\n\n<!-- Record required test coverage and validation. -->\n\n## Error handling\n\n<!-- Record error-handling expectations. -->\n\n## Dependency policy\n\n<!-- Record when and how dependencies may be added. -->\n`,
    "context/safety.md": `# Safety\n\n## Excluded paths\n\n${markdownList(config.safety.excluded_paths, "No excluded paths configured")}\n\n## Baseline rules\n\n- Do not reveal secrets or copy secret values into generated context.\n- Do not edit generated outputs unless explicitly allowed.\n- Require confirmation before destructive commands.\n- Respect repository boundaries and \`.gitignore\`.\n\n## Repository-specific rules\n\n<!-- Add sensitive paths and prohibited operations for this repository. -->\n`,
  };
}
