import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import { FilesystemGitRepositoryLocator } from "../../src/core/git/filesystem-git-repository-locator.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(name: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), name));
  temporaryDirectories.push(directory);
  return directory;
}

describe("FilesystemGitRepositoryLocator", () => {
  it("detects a .git directory from a nested directory", async () => {
    const root = await fixture("agentfold-git-dir-");
    const nested = path.join(root, "packages", "app");
    await mkdir(path.join(root, ".git"));
    await mkdir(nested, { recursive: true });
    const locator = new FilesystemGitRepositoryLocator(new NodeFileSystem(() => nested));

    await expect(locator.findRoot(nested)).resolves.toBe(root);
  });

  it("detects a .git worktree file", async () => {
    const root = await fixture("agentfold git file ");
    await writeFile(path.join(root, ".git"), "gitdir: ../worktrees/example\n", "utf8");
    const locator = new FilesystemGitRepositoryLocator(new NodeFileSystem(() => root));

    await expect(locator.findRoot(root)).resolves.toBe(root);
  });

  it("returns undefined outside a Git repository", async () => {
    const root = await fixture("agentfold-no-git-");
    const locator = new FilesystemGitRepositoryLocator(new NodeFileSystem(() => root));

    await expect(locator.findRoot(root)).resolves.toBeUndefined();
  });
});
