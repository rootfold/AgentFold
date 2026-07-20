import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("NodeFileSystem", () => {
  it("creates directories and reads and writes UTF-8 text in a fixture", async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), "agentfold-fs-"));
    temporaryDirectories.push(fixture);
    const fileSystem = new NodeFileSystem(() => fixture);
    const nestedDirectory = path.join(fixture, "nested");
    const file = path.join(nestedDirectory, "context.txt");

    await fileSystem.ensureDirectory(nestedDirectory);
    await fileSystem.writeText(file, "AgentFold ✓");

    await expect(fileSystem.exists(file)).resolves.toBe(true);
    await expect(fileSystem.readText(file)).resolves.toBe("AgentFold ✓");
    expect(fileSystem.currentWorkingDirectory()).toBe(fixture);
  });
});
