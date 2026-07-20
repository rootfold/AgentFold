export interface CliOutput {
  readonly useColor: boolean;
  write(text: string): void;
  writeError(text: string): void;
}

export function writeLine(output: CliOutput, text = ""): void {
  output.write(`${text}\n`);
}
