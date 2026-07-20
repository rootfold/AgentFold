import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/run-cli.js";
import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import { FilesystemGitRepositoryLocator } from "../../src/core/git/filesystem-git-repository-locator.js";
import { captureOutput } from "../helpers/capture-output.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("AgentFold CLI", () => {
  it("starts and displays help", async () => {
    const captured = captureOutput();

    const exitCode = await runCli(["node", "agentfold", "--help"], {
      output: captured.output,
    });

    expect(exitCode).toBe(0);
    expect(captured.stdout()).toContain("Usage: agentfold");
    expect(captured.stdout()).toContain("doctor");
    expect(captured.stderr()).toBe("");
  });

  it("starts and displays its version", async () => {
    const captured = captureOutput();

    const exitCode = await runCli(["node", "agentfold", "--version"], {
      output: captured.output,
      version: "1.2.3-test",
    });

    expect(exitCode).toBe(0);
    expect(captured.stdout()).toBe("1.2.3-test\n");
    expect(captured.stderr()).toBe("");
  });

  it("runs doctor in an isolated fixture directory", async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), "agentfold-doctor-"));
    temporaryDirectories.push(fixture);
    await mkdir(path.join(fixture, ".git"));
    await writeFile(path.join(fixture, "README.md"), "# Fixture\n", "utf8");

    const captured = captureOutput();
    const fileSystem = new NodeFileSystem(() => fixture);
    const exitCode = await runCli(["node", "agentfold", "doctor"], {
      fileSystem,
      gitRepositoryLocator: new FilesystemGitRepositoryLocator(fileSystem),
      output: captured.output,
    });

    expect(exitCode).toBe(0);
    expect(captured.stdout()).toContain("✓ passed [AFD001]");
    expect(captured.stdout()).toContain("Git repository detected");
    expect(captured.stdout()).toContain("⚠ warning [AFD004]");
    expect(captured.stdout()).toContain("expected before AgentFold initialization");
    expect(captured.stderr()).toBe("");
  });
});
