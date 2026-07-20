export interface ProcessRunOptions {
  readonly cwd: string;
}

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunner {
  run(
    command: string,
    arguments_: readonly string[],
    options: ProcessRunOptions,
  ): Promise<ProcessResult>;
}
