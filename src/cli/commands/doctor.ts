import path from "node:path";

import type { Command } from "commander";

import type { Diagnostic } from "../../core/diagnostics/diagnostic.js";
import { formatDiagnostic } from "../../core/diagnostics/format-diagnostic.js";
import type { FileSystem } from "../../core/filesystem/filesystem.js";
import type { GitRepositoryLocator } from "../../core/git/git-repository-locator.js";
import type { CliOutput } from "../output/cli-output.js";
import { writeLine } from "../output/cli-output.js";

export interface DoctorDependencies {
  readonly fileSystem: FileSystem;
  readonly gitRepositoryLocator: GitRepositoryLocator;
}

export interface DoctorResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly exitCode: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function runDoctor(dependencies: DoctorDependencies): Promise<DoctorResult> {
  const { fileSystem, gitRepositoryLocator } = dependencies;
  const diagnostics: Diagnostic[] = [];
  let workingDirectory: string;

  try {
    workingDirectory = fileSystem.currentWorkingDirectory();
    const accessible = await fileSystem.exists(workingDirectory);

    if (!accessible) {
      diagnostics.push({
        code: "AFD001",
        severity: "error",
        message: `Current working directory is not accessible: ${workingDirectory}`,
      });
      return { diagnostics, exitCode: 1 };
    }

    diagnostics.push({
      code: "AFD001",
      severity: "success",
      message: `Current working directory is accessible: ${workingDirectory}`,
    });
  } catch (error: unknown) {
    diagnostics.push({
      code: "AFD001",
      severity: "error",
      message: `Could not access the current working directory: ${errorMessage(error)}`,
    });
    return { diagnostics, exitCode: 1 };
  }

  try {
    const repositoryRoot = await gitRepositoryLocator.findRoot(workingDirectory);
    diagnostics.push(
      repositoryRoot === undefined
        ? {
            code: "AFD002",
            severity: "warning",
            message: "The current directory is not inside a Git repository.",
            suggestion: "Initialize Git before adopting AgentFold for this project.",
          }
        : {
            code: "AFD002",
            severity: "success",
            message: `Git repository detected at ${repositoryRoot}`,
          },
    );
  } catch (error: unknown) {
    diagnostics.push({
      code: "AFD002",
      severity: "error",
      message: `Git repository detection failed: ${errorMessage(error)}`,
    });
  }

  try {
    const readmeExists = await fileSystem.exists(path.join(workingDirectory, "README.md"));
    diagnostics.push(
      readmeExists
        ? {
            code: "AFD003",
            severity: "success",
            message: "README.md exists.",
          }
        : {
            code: "AFD003",
            severity: "warning",
            message: "README.md was not found.",
            suggestion: "Add project documentation before generating agent instructions.",
          },
    );
  } catch (error: unknown) {
    diagnostics.push({
      code: "AFD003",
      severity: "error",
      message: `README.md check failed: ${errorMessage(error)}`,
    });
  }

  try {
    const configExists = await fileSystem.exists(
      path.join(workingDirectory, ".agentfold", "config.yaml"),
    );
    diagnostics.push(
      configExists
        ? {
            code: "AFD004",
            severity: "success",
            message: ".agentfold/config.yaml exists.",
          }
        : {
            code: "AFD004",
            severity: "warning",
            message: ".agentfold/config.yaml was not found.",
            suggestion: "This is expected before AgentFold initialization.",
          },
    );
  } catch (error: unknown) {
    diagnostics.push({
      code: "AFD004",
      severity: "error",
      message: `AgentFold configuration check failed: ${errorMessage(error)}`,
    });
  }

  return {
    diagnostics,
    exitCode: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? 1 : 0,
  };
}

export function registerDoctorCommand(
  program: Command,
  dependencies: DoctorDependencies,
  output: CliOutput,
): void {
  program
    .command("doctor")
    .description("Run basic project readiness checks")
    .action(async () => {
      const result = await runDoctor(dependencies);
      writeLine(output, "AgentFold doctor");
      writeLine(output);

      for (const diagnostic of result.diagnostics) {
        writeLine(output, formatDiagnostic(diagnostic, { color: output.useColor }));
      }

      if (result.exitCode !== 0) {
        throw new DoctorCommandError(result.exitCode);
      }
    });
}

export class DoctorCommandError extends Error {
  constructor(readonly exitCode: number) {
    super("AgentFold doctor found execution failures");
    this.name = "DoctorCommandError";
  }
}
