import process from "node:process";

import type { CliOutput } from "./cli-output.js";

interface TextWriter {
  readonly isTTY?: boolean;
  write(text: string): unknown;
}

export function shouldUseColor(environment: NodeJS.ProcessEnv, isTerminal: boolean): boolean {
  return environment.NO_COLOR === undefined && isTerminal;
}

export class NodeCliOutput implements CliOutput {
  readonly useColor: boolean;

  constructor(
    private readonly stdout: TextWriter = process.stdout,
    private readonly stderr: TextWriter = process.stderr,
    environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.useColor = shouldUseColor(environment, stdout.isTTY ?? false);
  }

  write(text: string): void {
    this.stdout.write(text);
  }

  writeError(text: string): void {
    this.stderr.write(text);
  }
}
