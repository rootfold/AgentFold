export class CliCommandError extends Error {
  constructor(
    readonly exitCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CliCommandError";
  }
}
