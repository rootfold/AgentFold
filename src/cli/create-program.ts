import { Command } from "commander";

import type { FileSystem } from "../core/filesystem/filesystem.js";
import type { GitInspector } from "../core/git/git-inspector.js";
import type { GitRepositoryLocator } from "../core/git/git-repository-locator.js";
import { packageVersion } from "../package-metadata.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerInitCommand } from "./commands/init.js";
import { registerReportCommand } from "./commands/report.js";
import { registerStartCommand } from "./commands/start.js";
import type { StdinReader } from "./input/stdin-reader.js";
import type { CliOutput } from "./output/cli-output.js";

export interface CreateProgramOptions {
  readonly fileSystem: FileSystem;
  readonly gitRepositoryLocator: GitRepositoryLocator;
  readonly gitInspector: GitInspector;
  readonly stdinReader: StdinReader;
  readonly output: CliOutput;
  readonly now?: () => Date;
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
  registerInitCommand(
    program,
    {
      fileSystem: options.fileSystem,
      gitRepositoryLocator: options.gitRepositoryLocator,
      agentfoldVersion: options.version ?? packageVersion,
    },
    options.output,
  );
  registerStartCommand(program, options, options.output);
  registerReportCommand(program, options, options.output);

  return program;
}
