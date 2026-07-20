import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import { scanRepositoryMetadata } from "../../src/core/scanners/repository-metadata.js";
import type { PackageManager } from "../../src/core/scanners/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentfold-scanner-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("scanRepositoryMetadata", () => {
  it.each<[string, PackageManager]>([
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ])("detects %s as %s", async (lockfile, expected) => {
    const root = await fixture();
    await writeFile(path.join(root, lockfile), "", "utf8");

    const metadata = await scanRepositoryMetadata(new NodeFileSystem(() => root), root);

    expect(metadata.packageManager).toBe(expected);
    expect(metadata.lockfiles).toContain(lockfile);
    expect(metadata.commands.install).toBe(`${expected} install`);
  });

  it("maps only package scripts that actually exist", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "pnpm-lock.yaml"), "", "utf8");
    await writeFile(
      path.join(root, "package.json"),
      `\uFEFF${JSON.stringify({
        engines: { node: ">=20" },
        scripts: { dev: "vite", test: "vitest", release: "changeset publish" },
      })}`,
      "utf8",
    );

    const metadata = await scanRepositoryMetadata(new NodeFileSystem(() => root), root);

    expect(metadata.node).toMatchObject({ present: true, nodeVersion: ">=20" });
    expect(metadata.commands).toEqual({
      install: "pnpm install",
      dev: "pnpm dev",
      test: "pnpm test",
    });
    expect(metadata.commands.build).toBeUndefined();
    expect(metadata.commands.release).toBeUndefined();
  });

  it("detects Python markers and existing top-level source and test directories", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "pyproject.toml"), "[project]\nname = 'example'\n", "utf8");
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "tests"));

    const metadata = await scanRepositoryMetadata(new NodeFileSystem(() => root), root);

    expect(metadata.python).toEqual({ present: true, markerFiles: ["pyproject.toml"] });
    expect(metadata.sourceDirectories).toEqual(["src"]);
    expect(metadata.testDirectories).toEqual(["tests"]);
    expect(metadata.packageManager).toBeUndefined();
    expect(metadata.commands).toEqual({});
  });
});
