import type { Diagnostic } from "../diagnostics/diagnostic.js";

export interface GitPathMove {
  readonly from: string;
  readonly to: string;
}

export interface ChangedPathGroups {
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly deleted: readonly string[];
  readonly renamed: readonly GitPathMove[];
  readonly copied: readonly GitPathMove[];
  readonly untracked: readonly string[];
  readonly unmerged: readonly string[];
}

export interface DiffStatistics {
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
  readonly binaryFiles: number;
  readonly untrackedFiles: number;
}

export interface RecentCommit {
  readonly hash: string;
  readonly subject: string;
}

export interface CheckpointGitFacts {
  readonly branch: string;
  readonly commit: string | null;
  readonly detached: boolean;
  readonly workingTree: "clean" | "dirty";
  readonly hasStagedChanges: boolean;
  readonly hasUnstagedChanges: boolean;
  readonly changedPaths: ChangedPathGroups;
  readonly diffStatistics: DiffStatistics;
  readonly recentCommits: readonly RecentCommit[];
}

export interface CheckpointGitRequest {
  readonly startingCommit: string | null;
  readonly startedAt: string;
  readonly recentCommitLimit?: number;
}

export interface CheckpointGitObservation {
  readonly facts: CheckpointGitFacts;
  readonly diagnostics: readonly Diagnostic[];
}
