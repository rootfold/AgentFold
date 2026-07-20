import { Command } from "commander";

import type { FileSystem } from "../core/filesystem/filesystem.js";
import type { GitRepositoryLocator } from "../core/git/git-repository-locator.js";
import { packageVersion } from "../package-metadata.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import type { CliOutput } from "./output/cli-output.js";

export interface CreateProgramOptions {
  readonly fileSystem: FileSystem;
  readonly gitRepositoryLocator: GitRepositoryLocator;
  readonly output: CliOutput;
  readonly version?: string;
}

export function createProgram(options: CreateProgramOptions): Command {
  const program = new Command();

  program
    .name("agentfold")
    .description("Keep project context portable across coding agents")
    .version(options.version ?? packageVersion)
    .option("--debug", "show stack traces for unexpected errors")
    .showSuggestionAfterError()
    .configureOutput({
      writeOut: (text) => options.output.write(text),
      writeErr: (text) => options.output.writeError(text),
    })
    .exitOverride()
    .action(() => {
      program.outputHelp();
    });

  registerDoctorCommand(program, options, options.output);

  return program;
}
