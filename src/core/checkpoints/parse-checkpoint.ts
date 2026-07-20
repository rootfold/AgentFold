import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { checkpointSchema } from "./checkpoint-schema.js";
import { createCheckpointFingerprint } from "./fingerprint.js";
import { renderCheckpointBody } from "./serialize-checkpoint.js";
import type { Checkpoint } from "./types.js";

const frontMatterSchema = z
  .object({
    schema: z.literal(1),
    checkpoint_id: z.string(),
    task_id: z.string(),
    task_title: z.string(),
    task_objective: z.string(),
    created_at: z.string(),
    checkpoint_agent: z.string().optional(),
    last_reporting_agent: z.string().optional(),
    semantic_revision: z.number(),
    semantic_freshness: z.string(),
    fingerprint: z.string(),
    observed_git: z
      .object({
        starting_branch: z.string(),
        current_branch: z.string(),
        starting_commit: z.string().nullable(),
        current_commit: z.string().nullable(),
        detached: z.boolean(),
        branch_changed: z.boolean(),
        head_changed: z.boolean(),
        working_tree: z.string(),
        has_staged_changes: z.boolean(),
        has_unstaged_changes: z.boolean(),
        changed_paths: z
          .object({
            added: z.unknown(),
            modified: z.unknown(),
            deleted: z.unknown(),
            renamed: z.unknown(),
            copied: z.unknown(),
            untracked: z.unknown(),
            unmerged: z.unknown(),
          })
          .strict(),
        diff_statistics: z
          .object({
            files_changed: z.unknown(),
            insertions: z.unknown(),
            deletions: z.unknown(),
            binary_files: z.unknown(),
            untracked_files: z.unknown(),
          })
          .strict(),
        recent_commits: z.unknown(),
        untracked_files_excluded_from_line_statistics: z.boolean(),
      })
      .strict(),
    reported_state: z
      .object({
        completed: z.unknown(),
        in_progress: z.unknown(),
        decisions: z.unknown(),
        failed_attempts: z.unknown(),
        blockers: z.unknown(),
        next_actions: z.unknown(),
        validation: z.unknown(),
        assumptions: z.unknown(),
      })
      .strict(),
  })
  .strict();

export interface CheckpointParseIssue {
  readonly path: string;
  readonly message: string;
}

export class CheckpointParseError extends Error {
  constructor(readonly issues: readonly CheckpointParseIssue[]) {
    super(
      `Invalid checkpoint:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`,
    );
    this.name = "CheckpointParseError";
  }
}

function fail(path: string, message: string): never {
  throw new CheckpointParseError([{ path, message }]);
}

function issues(error: z.ZodError): readonly CheckpointParseIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
    message: issue.message,
  }));
}

export function parseCheckpoint(input: string, expectedTaskId?: string): Checkpoint {
  const source = input.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);
  if (match === null) fail("frontmatter", "Expected YAML front matter delimited by ---");

  let raw: unknown;
  try {
    raw = parseYaml(match[1] ?? "");
  } catch {
    fail("frontmatter", "Malformed YAML front matter");
  }
  const frontMatter = frontMatterSchema.safeParse(raw);
  if (!frontMatter.success) throw new CheckpointParseError(issues(frontMatter.error));
  const value = frontMatter.data;
  const git = value.observed_git;
  const checkpointResult = checkpointSchema.safeParse({
    schemaVersion: value.schema,
    checkpointId: value.checkpoint_id,
    taskId: value.task_id,
    taskTitle: value.task_title,
    taskObjective: value.task_objective,
    createdAt: value.created_at,
    ...(value.checkpoint_agent === undefined ? {} : { checkpointAgent: value.checkpoint_agent }),
    ...(value.last_reporting_agent === undefined
      ? {}
      : { lastReportingAgent: value.last_reporting_agent }),
    semanticRevision: value.semantic_revision,
    semanticFreshness: value.semantic_freshness,
    fingerprint: value.fingerprint,
    observedGit: {
      startingBranch: git.starting_branch,
      currentBranch: git.current_branch,
      startingCommit: git.starting_commit,
      currentCommit: git.current_commit,
      detached: git.detached,
      branchChanged: git.branch_changed,
      headChanged: git.head_changed,
      workingTree: git.working_tree,
      hasStagedChanges: git.has_staged_changes,
      hasUnstagedChanges: git.has_unstaged_changes,
      changedPaths: git.changed_paths,
      diffStatistics: {
        filesChanged: git.diff_statistics.files_changed,
        insertions: git.diff_statistics.insertions,
        deletions: git.diff_statistics.deletions,
        binaryFiles: git.diff_statistics.binary_files,
        untrackedFiles: git.diff_statistics.untracked_files,
      },
      recentCommits: git.recent_commits,
      untrackedFilesExcludedFromLineStatistics: git.untracked_files_excluded_from_line_statistics,
    },
    reportedState: {
      completed: value.reported_state.completed,
      inProgress: value.reported_state.in_progress,
      decisions: value.reported_state.decisions,
      failedAttempts: value.reported_state.failed_attempts,
      blockers: value.reported_state.blockers,
      nextActions: value.reported_state.next_actions,
      validation: value.reported_state.validation,
      assumptions: value.reported_state.assumptions,
    },
  });
  if (!checkpointResult.success) throw new CheckpointParseError(issues(checkpointResult.error));
  const checkpoint = checkpointResult.data;

  if (expectedTaskId !== undefined && checkpoint.taskId !== expectedTaskId) {
    fail("task_id", `Expected ${expectedTaskId} but found ${checkpoint.taskId}`);
  }

  const calculatedFingerprint = createCheckpointFingerprint({
    taskId: checkpoint.taskId,
    currentBranch: checkpoint.observedGit.currentBranch,
    currentCommit: checkpoint.observedGit.currentCommit,
    detached: checkpoint.observedGit.detached,
    branchChanged: checkpoint.observedGit.branchChanged,
    headChanged: checkpoint.observedGit.headChanged,
    workingTree: checkpoint.observedGit.workingTree,
    hasStagedChanges: checkpoint.observedGit.hasStagedChanges,
    hasUnstagedChanges: checkpoint.observedGit.hasUnstagedChanges,
    changedPaths: checkpoint.observedGit.changedPaths,
    diffStatistics: checkpoint.observedGit.diffStatistics,
    recentCommits: checkpoint.observedGit.recentCommits,
    semanticRevision: checkpoint.semanticRevision,
  });
  if (checkpoint.fingerprint !== calculatedFingerprint) {
    fail("fingerprint", "Stored fingerprint does not match checkpoint inputs");
  }

  if ((match[2] ?? "").trim() !== renderCheckpointBody(checkpoint)) {
    fail("body", "Checkpoint body does not match the validated checkpoint data");
  }

  return checkpoint;
}
