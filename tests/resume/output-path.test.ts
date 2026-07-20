import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import { prepareResumeOutputPath } from "../../src/core/resume/output-path.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function root(name: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), name));
  temporaryDirectories.push(directory);
  return directory;
}

describe("resume output paths", () => {
  it("normalizes Windows separators and allows safe missing parents inside a path with spaces", async () => {
    const repositoryRoot = await root("agentfold output spaces ");
    const fileSystem = new NodeFileSystem(() => repositoryRoot);

    const result = await prepareResumeOutputPath(
      fileSystem,
      repositoryRoot,
      "exports\\nested\\handoff.md",
      "markdown",
    );

    expect(result).toMatchObject({
      status: "ready",
      relativePath: "exports/nested/handoff.md",
    });
    if (result.status !== "ready") throw new Error("Expected safe output path");
    expect(result.destination).toBe(path.join(repositoryRoot, "exports", "nested", "handoff.md"));
  });

  it("rejects absolute and parent-traversal destinations", async () => {
    const repositoryRoot = await root("agentfold-output-");
    const fileSystem = new NodeFileSystem(() => repositoryRoot);

    for (const requested of ["../handoff.md", "/tmp/handoff.md", "C:\\temp\\handoff.md"]) {
      await expect(
        prepareResumeOutputPath(fileSystem, repositoryRoot, requested, "markdown"),
      ).resolves.toMatchObject({ status: "error", exitCode: 2 });
    }
  });

  it("rejects an existing parent whose real path escapes the repository", async () => {
    const repositoryRoot = await root("agentfold-output-");
    const outside = await root("agentfold-outside-");
    const escapingParent = path.join(repositoryRoot, "escaping");
    await mkdir(escapingParent);
    class EscapingFileSystem extends NodeFileSystem {
      override realPath(candidate: string): Promise<string> {
        return path.resolve(candidate) === path.resolve(escapingParent)
          ? Promise.resolve(outside)
          : super.realPath(candidate);
      }
    }
    const fileSystem = new EscapingFileSystem(() => repositoryRoot);

    const result = await prepareResumeOutputPath(
      fileSystem,
      repositoryRoot,
      "escaping/handoff.md",
      "markdown",
    );

    expect(result).toMatchObject({
      status: "error",
      exitCode: 2,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "AFR020" })]),
    });
  });
});
