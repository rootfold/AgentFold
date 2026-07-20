import { describe, expect, it } from "vitest";

import { CommandGitInspector } from "../../src/core/git/git-inspector.js";
import type {
  ProcessResult,
  ProcessRunner,
  ProcessRunOptions,
} from "../../src/core/process/process-runner.js";

class RecordingProcessRunner implements ProcessRunner {
  readonly calls: {
    readonly command: string;
    readonly arguments: readonly string[];
    readonly options: ProcessRunOptions;
  }[] = [];

  constructor(private readonly results: ProcessResult[]) {}

  run(
    command: string,
    arguments_: readonly string[],
    options: ProcessRunOptions,
  ): Promise<ProcessResult> {
    this.calls.push({ command, arguments: arguments_, options });
    const result = this.results.shift();
    if (result === undefined) {
      return Promise.reject(new Error("No fake process result"));
    }
    return Promise.resolve(result);
  }
}

const success = (stdout = ""): ProcessResult => ({ exitCode: 0, stdout, stderr: "" });
const failure = (exitCode = 1): ProcessResult => ({ exitCode, stdout: "", stderr: "" });

describe("CommandGitInspector", () => {
  it("reads a normal branch and current commit using argument arrays", async () => {
    const runner = new RecordingProcessRunner([
      success("feat/oauth\n"),
      success("0123456789abcdef0123456789abcdef01234567\n"),
    ]);
    const inspector = new CommandGitInspector(runner);

    await expect(inspector.readWorkingFacts("C:\\repo space")).resolves.toEqual({
      branch: "feat/oauth",
      commit: "0123456789abcdef0123456789abcdef01234567",
      detached: false,
    });
    expect(runner.calls).toEqual([
      {
        command: "git",
        arguments: ["symbolic-ref", "--quiet", "--short", "HEAD"],
        options: { cwd: "C:\\repo space" },
      },
      {
        command: "git",
        arguments: ["rev-parse", "--verify", "--quiet", "HEAD"],
        options: { cwd: "C:\\repo space" },
      },
    ]);
  });

  it("supports detached HEAD and repositories with no commits", async () => {
    const detached = new CommandGitInspector(
      new RecordingProcessRunner([
        failure(),
        success("0123456789abcdef0123456789abcdef01234567\n"),
      ]),
    );
    await expect(detached.readWorkingFacts("repo")).resolves.toMatchObject({
      branch: "HEAD (detached)",
      detached: true,
    });

    const unborn = new CommandGitInspector(
      new RecordingProcessRunner([success("main\n"), failure()]),
    );
    await expect(unborn.readWorkingFacts("repo")).resolves.toEqual({
      branch: "main",
      commit: null,
      detached: false,
    });
  });

  it("checks only the requested Git-ignore path and performs no Git mutation", async () => {
    const runner = new RecordingProcessRunner([success()]);
    const inspector = new CommandGitInspector(runner);

    await expect(inspector.isPathIgnored("repo", ".agentfold/state/")).resolves.toBe(true);
    expect(runner.calls[0]?.arguments).toEqual([
      "check-ignore",
      "--quiet",
      "--",
      ".agentfold/state/",
    ]);
    const allArguments = runner.calls.flatMap((call) => call.arguments);
    for (const forbidden of ["commit", "branch", "add", "reset", "stash", "push", "remote"]) {
      expect(allArguments).not.toContain(forbidden);
    }
  });
});
