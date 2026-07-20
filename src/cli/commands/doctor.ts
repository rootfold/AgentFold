import path from "node:path";

import type { Command } from "commander";

import { ConfigSyntaxError, loadConfig } from "../../core/config/load-config.js";
import { ConfigValidationError } from "../../core/config/parse-config.js";
import type { Diagnostic } from "../../core/diagnostics/diagnostic.js";
import { formatDiagnostic } from "../../core/diagnostics/format-diagnostic.js";
import type { FileSystem } from "../../core/filesystem/filesystem.js";
import type { GitRepositoryLocator } from "../../core/git/git-repository-locator.js";
import { inspectInstallation } from "../../core/initialization/inspect-installation.js";
import type { CliOutput } from "../output/cli-output.js";
import { writeLine } from "../output/cli-output.js";
import { CliCommandError } from "../command-error.js";

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
  let repositoryRoot: string | undefined;
  let invalidConfiguration = false;

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
    repositoryRoot = await gitRepositoryLocator.findRoot(workingDirectory);
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
    const projectRoot = repositoryRoot ?? workingDirectory;
    const readmeExists = await fileSystem.exists(path.join(projectRoot, "README.md"));
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
    const projectRoot = repositoryRoot ?? workingDirectory;
    const inspection = await inspectInstallation(fileSystem, projectRoot);

    if (inspection.configExists) {
      try {
        await loadConfig(fileSystem, path.join(projectRoot, ".agentfold", "config.yaml"));

        if (inspection.missingFiles.length === 0) {
          diagnostics.push({
            code: "AFD004",
            severity: "success",
            message: "AgentFold is initialized and its configuration is valid.",
          });
        } else {
          diagnostics.push({
            code: "AFD004",
            severity: "warning",
            message: `AgentFold is partially initialized. Missing: ${inspection.missingFiles.join(", ")}.`,
            suggestion: "Restore the missing canonical files; doctor did not modify anything.",
          });
        }
      } catch (error: unknown) {
        if (error instanceof ConfigSyntaxError || error instanceof ConfigValidationError) {
          invalidConfiguration = true;
          diagnostics.push({
            code: "AFD004",
            severity: "error",
            message: error.message,
            suggestion: "Correct .agentfold/config.yaml and run doctor again.",
          });
        } else {
          throw error;
        }
      }
    } else if (inspection.directoryExists) {
      const present =
        inspection.presentFiles.length === 0 ? "none" : inspection.presentFiles.join(", ");
      diagnostics.push({
        code: "AFD004",
        severity: "warning",
        message: `A partial AgentFold installation was found. Present: ${present}. Missing: ${inspection.missingFiles.join(", ")}.`,
        suggestion: "Review the partial installation before running init again.",
      });
    } else {
      diagnostics.push({
        code: "AFD004",
        severity: "warning",
        message: ".agentfold/config.yaml was not found.",
        suggestion: "This is expected before AgentFold initialization.",
      });
    }
  } catch (error: unknown) {
    diagnostics.push({
      code: "AFD004",
      severity: "error",
      message: `AgentFold configuration check failed: ${errorMessage(error)}`,
    });
  }

  return {
    diagnostics,
    exitCode: invalidConfiguration
      ? 2
      : diagnostics.some((diagnostic) => diagnostic.severity === "error")
        ? 1
        : 0,
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
        throw new CliCommandError(result.exitCode, "AgentFold doctor found execution failures");
      }
    });
}
