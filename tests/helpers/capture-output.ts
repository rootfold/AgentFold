import type { CliOutput } from "../../src/cli/output/cli-output.js";

export interface CapturedOutput {
  readonly output: CliOutput;
  readonly stdout: () => string;
  readonly stderr: () => string;
}

export function captureOutput(useColor = false): CapturedOutput {
  let stdout = "";
  let stderr = "";

  return {
    output: {
      useColor,
      write(text: string): void {
        stdout += text;
      },
      writeError(text: string): void {
        stderr += text;
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}
