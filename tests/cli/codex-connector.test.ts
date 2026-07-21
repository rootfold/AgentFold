import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/run-cli.js";
import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import type { ProcessRunner } from "../../src/core/process/process-runner.js";
import { captureOutput } from "../helpers/capture-output.js";
import { createContinuityFixture } from "../helpers/continuity-fixture.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Codex connector CLI", () => {
  it("previews by default and dry-run, then installs, verifies, and disconnects with --yes", async () => {
    const repository = await createContinuityFixture(temporaryDirectories, {
      name: "agentfold Codex CLI repository ",
    });
    const home = await mkdtemp(path.join(os.tmpdir(), "agentfold Codex CLI home "));
    const state = await mkdtemp(path.join(os.tmpdir(), "agentfold Codex CLI state "));
    temporaryDirectories.push(home, state);
    const codexHome = path.join(home, ".codex");
    const config = path.join(codexHome, "config.toml");
    await mkdir(codexHome, { recursive: true });
    const fakeSecret = "FAKE_SECRET_MUST_NOT_BE_PRINTED";
    const original = `model = "gpt-test"\nsecret = "${fakeSecret}"\n`;
    await writeFile(config, original, "utf8");
    const processRunner: ProcessRunner = {
      run: (command, arguments_) => {
        if (command !== "git") return Promise.resolve({ exitCode: 0, stdout: "0.0.0", stderr: "" });
        const value =
          arguments_[1] === "--show-toplevel"
            ? repository.root
            : path.join(repository.root, ".git");
        return Promise.resolve({ exitCode: 0, stdout: `${value}\n`, stderr: "" });
      },
    };
    const baseOptions = {
      fileSystem: new NodeFileSystem(() => repository.root),
      processRunner,
      codexConnectorOverrides: {
        platform: {
          platform: process.platform,
          environment: { ...process.env, CODEX_HOME: codexHome, PATH: "", LOCALAPPDATA: home },
          homeDirectory: home,
        },
        codexHome,
        stateDirectory: state,
        resolveLaunchDescriptor: () =>
          Promise.resolve({
            command: process.execPath,
            argsPrefix: [path.resolve("dist/cli.js")],
            fingerprint: "e".repeat(64),
          }),
        generateBackupIdentity: () => "codex-cli-backup",
        verifyConnection: () =>
          Promise.resolve({
            host: "codex" as const,
            valid: true,
            toolsAvailable: 8,
            serviceAvailable: true,
            exitCode: 0 as const,
            diagnostics: [],
          }),
      },
    };

    for (const extra of [[], ["--dry-run"]]) {
      const captured = captureOutput();
      expect(
        await runCli(["node", "agentfold", "connect", "codex", "--surface", "cli", ...extra], {
          ...baseOptions,
          output: captured.output,
        }),
      ).toBe(0);
      expect(captured.stdout()).toContain("No files were changed");
      expect(captured.stdout()).not.toContain(fakeSecret);
      expect(await readFile(config, "utf8")).toBe(original);
    }

    const installed = captureOutput();
    expect(
      await runCli(["node", "agentfold", "connect", "codex", "--surface", "cli", "--yes"], {
        ...baseOptions,
        output: installed.output,
      }),
    ).toBe(0);
    expect(installed.stdout()).toContain("Codex connector was installed");
    expect(installed.stdout()).not.toContain(fakeSecret);
    expect(await readFile(config, "utf8")).toContain("[mcp_servers.agentfold]");

    const verified = captureOutput();
    expect(
      await runCli(["node", "agentfold", "verify", "codex"], {
        ...baseOptions,
        output: verified.output,
      }),
    ).toBe(0);
    expect(verified.stdout()).toContain("Tools: 8");

    const previewDisconnect = captureOutput();
    expect(
      await runCli(["node", "agentfold", "disconnect", "codex"], {
        ...baseOptions,
        output: previewDisconnect.output,
      }),
    ).toBe(0);
    expect(previewDisconnect.stdout()).toContain("No files were changed");
    expect(await readFile(config, "utf8")).toContain("[mcp_servers.agentfold]");

    const disconnected = captureOutput();
    expect(
      await runCli(["node", "agentfold", "disconnect", "codex", "--yes"], {
        ...baseOptions,
        output: disconnected.output,
      }),
    ).toBe(0);
    expect(await readFile(config, "utf8")).toBe(original);
    expect(disconnected.stdout()).toContain("service was left running");
  });
});
