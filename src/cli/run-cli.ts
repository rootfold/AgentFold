import process from "node:process";

import { CommanderError } from "commander";

import { NodeFileSystem } from "../core/filesystem/node-filesystem.js";
import { FilesystemGitRepositoryLocator } from "../core/git/filesystem-git-repository-locator.js";
import { DoctorCommandError } from "./commands/doctor.js";
import { createProgram, type CreateProgramOptions } from "./create-program.js";
import { NodeCliOutput } from "./output/node-cli-output.js";

export type RunCliOptions = Partial<CreateProgramOptions>;

function defaultOptions(options: RunCliOptions): CreateProgramOptions {
  const fileSystem = options.fileSystem ?? new NodeFileSystem();

  return {
    fileSystem,
    gitRepositoryLocator:
      options.gitRepositoryLocator ?? new FilesystemGitRepositoryLocator(fileSystem),
    output: options.output ?? new NodeCliOutput(),
    ...(options.version === undefined ? {} : { version: options.version }),
  };
}

export async function runCli(
  arguments_: readonly string[] = process.argv,
  options: RunCliOptions = {},
): Promise<number> {
  const resolvedOptions = defaultOptions(options);
  const program = createProgram(resolvedOptions);

  try {
    await program.parseAsync([...arguments_]);
    return 0;
  } catch (error: unknown) {
    if (error instanceof DoctorCommandError) {
      return error.exitCode;
    }

    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    resolvedOptions.output.writeError(`Error: ${message}\n`);

    if (program.opts<{ debug?: boolean }>().debug === true && error instanceof Error) {
      resolvedOptions.output.writeError(`${error.stack ?? error.message}\n`);
    }

    return 1;
  }
}
