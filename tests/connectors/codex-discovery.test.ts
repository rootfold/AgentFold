import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import {
  discoverCodex,
  selectCodexTarget,
} from "../../src/integrations/connectors/codex/codex-discovery.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Codex connector discovery", () => {
  it("discovers CLI, IDE, and app through their shared user configuration", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "agentfold Codex discovery home "));
    temporaryDirectories.push(home);
    const codexHome = path.join(home, "Codex Home with spaces");
    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(codexHome, "config.toml"), 'model = "gpt-test"\n', "utf8");
    const fileSystem = new NodeFileSystem(() => home);
    const discovery = await discoverCodex({
      fileSystem,
      codexHome,
      platform: {
        platform: process.platform,
        environment: { CODEX_HOME: codexHome, PATH: "", LOCALAPPDATA: home },
        homeDirectory: home,
      },
    });
    expect(discovery.configPath).toBe(path.join(codexHome, "config.toml"));
    expect(discovery.surfaces).toMatchObject([
      { surface: "cli", installed: true },
      { surface: "ide", installed: true },
      { surface: "app", installed: true },
    ]);
    expect(selectCodexTarget(discovery, "all")).toMatchObject({
      status: "selected",
      surfaces: ["cli", "ide", "app"],
      configPath: discovery.configPath,
    });
  });

  it("deduplicates shared configuration and permits an explicit surface without evidence", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "agentfold empty Codex discovery "));
    temporaryDirectories.push(home);
    const codexHome = path.join(home, "not-created");
    const discovery = await discoverCodex({
      fileSystem: new NodeFileSystem(() => home),
      codexHome,
      platform: {
        platform: process.platform,
        environment: { CODEX_HOME: codexHome, PATH: "", LOCALAPPDATA: path.join(home, "missing") },
        homeDirectory: home,
      },
    });
    expect(selectCodexTarget(discovery, "auto")).toMatchObject({ status: "error", exitCode: 6 });
    expect(selectCodexTarget(discovery, "app")).toMatchObject({
      status: "selected",
      surfaces: ["app"],
    });
    expect(selectCodexTarget(discovery, "desktop")).toMatchObject({ status: "error", exitCode: 2 });
  });
});
