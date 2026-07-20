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
    await expect(fileSystem.realPath(file)).resolves.toBe(path.resolve(file));
    await expect(fileSystem.readText(file)).resolves.toBe("AgentFold ✓");
    expect(fileSystem.currentWorkingDirectory()).toBe(fixture);
  });

  it("lists, classifies, renames, and removes fixture entries", async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), "agentfold-fs-"));
    temporaryDirectories.push(fixture);
    const fileSystem = new NodeFileSystem(() => fixture);
    const source = path.join(fixture, "source");
    const destination = path.join(fixture, "destination");

    await fileSystem.ensureDirectory(source);
    await fileSystem.writeText(path.join(source, "file.txt"), "content");

    await expect(fileSystem.entryType(source)).resolves.toBe("directory");
    await expect(fileSystem.entryType(path.join(source, "file.txt"))).resolves.toBe("file");
    await expect(fileSystem.listDirectory(source)).resolves.toEqual(["file.txt"]);

    await fileSystem.rename(source, destination);
    await expect(fileSystem.exists(destination)).resolves.toBe(true);
    await fileSystem.remove(destination, { recursive: true });
    await expect(fileSystem.entryType(destination)).resolves.toBeUndefined();
  });
});
