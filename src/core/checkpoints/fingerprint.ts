import { createHash } from "node:crypto";

import type {
  ChangedPathGroups,
  DiffStatistics,
  RecentCommit,
} from "../git/checkpoint-git-types.js";
import { comparePortablePaths, normalizeGitPath } from "../git/git-path.js";

export interface CheckpointFingerprintInput {
  readonly kind?: "progress" | "final";
  readonly taskStatus?: "completed";
  readonly taskId: string;
  readonly currentBranch: string;
  readonly currentCommit: string | null;
  readonly detached: boolean;
  readonly branchChanged: boolean;
  readonly headChanged: boolean;
  readonly workingTree: "clean" | "dirty";
  readonly hasStagedChanges: boolean;
  readonly hasUnstagedChanges: boolean;
  readonly changedPaths: ChangedPathGroups;
  readonly diffStatistics: DiffStatistics;
  readonly recentCommits: readonly RecentCommit[];
  readonly semanticRevision: number;
}

function paths(values: readonly string[]): readonly string[] {
  return [...new Set(values.map(normalizeGitPath))].sort(comparePortablePaths);
}

function moves(values: readonly { readonly from: string; readonly to: string }[]) {
  return values
    .map((move) => ({ from: normalizeGitPath(move.from), to: normalizeGitPath(move.to) }))
    .sort((left, right) => {
      const destination = comparePortablePaths(left.to, right.to);
      return destination === 0 ? comparePortablePaths(left.from, right.from) : destination;
    });
}

export function createCheckpointFingerprint(input: CheckpointFingerprintInput): string {
  const meaningful = {
    ...(input.kind === "final"
      ? { lifecycle: { kind: input.kind, taskStatus: input.taskStatus } }
      : {}),
    taskId: input.taskId,
    currentBranch: input.currentBranch,
    currentCommit: input.currentCommit,
    detached: input.detached,
    branchChanged: input.branchChanged,
    headChanged: input.headChanged,
    workingTree: input.workingTree,
    hasStagedChanges: input.hasStagedChanges,
    hasUnstagedChanges: input.hasUnstagedChanges,
    changedPaths: {
      added: paths(input.changedPaths.added),
      modified: paths(input.changedPaths.modified),
      deleted: paths(input.changedPaths.deleted),
      renamed: moves(input.changedPaths.renamed),
      copied: moves(input.changedPaths.copied),
      untracked: paths(input.changedPaths.untracked),
      unmerged: paths(input.changedPaths.unmerged),
    },
    diffStatistics: input.diffStatistics,
    recentCommits: input.recentCommits.map((commit) => ({
      hash: commit.hash,
      subject: commit.subject,
    })),
    semanticRevision: input.semanticRevision,
  };

  return createHash("sha256").update(JSON.stringify(meaningful), "utf8").digest("hex");
}
