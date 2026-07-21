import { createHash } from "node:crypto";
import path from "node:path";

import type { FileSystem } from "../../../core/filesystem/filesystem.js";
import type { ProcessRunner } from "../../../core/process/process-runner.js";

export interface CodexWorktreeIdentity {
  readonly kind: "main" | "linked";
  readonly repositoryRoot: string;
  readonly repositoryId: string;
  readonly repositoryFamilyId: string;
}

function safeOutput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.includes("\0")) {
    throw new Error("Git returned an invalid worktree path.");
  }
  return trimmed;
}

function hashIdentity(value: string, platform: NodeJS.Platform): string {
  const normalized = platform === "win32" ? value.toLocaleLowerCase("en-US") : value;
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 24);
}

function samePath(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalizedLeft = platform === "win32" ? left.toLocaleLowerCase("en-US") : left;
  const normalizedRight = platform === "win32" ? right.toLocaleLowerCase("en-US") : right;
  return normalizedLeft === normalizedRight;
}

export async function resolveCodexWorktreeIdentity(input: {
  readonly fileSystem: FileSystem;
  readonly processRunner: ProcessRunner;
  readonly repositoryRoot: string;
  readonly platform?: NodeJS.Platform;
}): Promise<CodexWorktreeIdentity> {
  const platform = input.platform ?? process.platform;
  const platformPath = platform === "win32" ? path.win32 : path.posix;
  const run = async (argument: string): Promise<string> => {
    const result = await input.processRunner.run("git", ["rev-parse", argument], {
      cwd: input.repositoryRoot,
    });
    if (result.exitCode !== 0) throw new Error("Git worktree inspection failed.");
    return safeOutput(result.stdout);
  };
  const [rootOutput, commonOutput, gitOutput] = await Promise.all([
    run("--show-toplevel"),
    run("--git-common-dir"),
    run("--git-dir"),
  ]);
  const repositoryRoot = await input.fileSystem.realPath(
    platformPath.resolve(input.repositoryRoot, rootOutput),
  );
  const commonDirectory = await input.fileSystem.realPath(
    platformPath.resolve(repositoryRoot, commonOutput),
  );
  const gitDirectory = await input.fileSystem.realPath(
    platformPath.resolve(repositoryRoot, gitOutput),
  );
  return {
    kind: samePath(commonDirectory, gitDirectory, platform) ? "main" : "linked",
    repositoryRoot,
    repositoryId: hashIdentity(repositoryRoot, platform),
    repositoryFamilyId: hashIdentity(commonDirectory, platform),
  };
}
