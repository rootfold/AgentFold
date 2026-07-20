import { stringify as stringifyYaml } from "yaml";

import { checkpointSchema } from "./checkpoint-schema.js";
import type { Checkpoint } from "./types.js";

function list(items: readonly string[], transform: (item: string) => string = String): string {
  return items.length === 0 ? "None." : items.map((item) => `- ${transform(item)}`).join("\n");
}

function inlineCode(value: string): string {
  const longestRun = Math.max(0, ...[...value.matchAll(/`+/gu)].map((match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const padding = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${padding}${value}${padding}${fence}`;
}

function moves(items: readonly { readonly from: string; readonly to: string }[]): string {
  return items.length === 0
    ? "None."
    : items.map((item) => `- ${inlineCode(item.from)} → ${inlineCode(item.to)}`).join("\n");
}

function decisions(items: Checkpoint["reportedState"]["decisions"]): string {
  return items.length === 0
    ? "None."
    : items
        .map(
          (item, index) =>
            `### Entry ${index + 1}\n\nDecision: ${item.decision}\nReason: ${item.reason}`,
        )
        .join("\n\n");
}

function failedAttempts(items: Checkpoint["reportedState"]["failedAttempts"]): string {
  return items.length === 0
    ? "None."
    : items
        .map(
          (item, index) =>
            `### Entry ${index + 1}\n\nAttempt: ${item.attempt}\nResult: ${item.result}`,
        )
        .join("\n\n");
}

function validation(items: Checkpoint["reportedState"]["validation"]): string {
  return items.length === 0
    ? "None."
    : items
        .map((item) => `- ${inlineCode(item.command)} — ${item.status}: ${item.summary}`)
        .join("\n");
}

function semanticFreshness(checkpoint: Checkpoint): string {
  if (checkpoint.semanticFreshness === "none") {
    return "No semantic report has been submitted. This checkpoint contains Git facts only.";
  }
  if (checkpoint.semanticFreshness === "new") {
    return `Includes new semantic report revision ${checkpoint.semanticRevision}.`;
  }
  return `Reuses semantic report revision ${checkpoint.semanticRevision}; no newer report was submitted.`;
}

export function renderCheckpointBody(checkpoint: Checkpoint): string {
  const git = checkpoint.observedGit;
  const reported = checkpoint.reportedState;
  const commits =
    git.recentCommits.length === 0
      ? "None."
      : git.recentCommits
          .map((commit) => `- ${inlineCode(commit.hash)} ${commit.subject}`)
          .join("\n");

  return [
    `# Objective\n\n> ${checkpoint.taskObjective}`,
    [
      "# Automatically observed Git facts",
      "## Branch and HEAD",
      `- Starting branch: ${inlineCode(git.startingBranch)}`,
      `- Current branch: ${inlineCode(git.currentBranch)}`,
      `- Starting commit: ${git.startingCommit === null ? "None." : inlineCode(git.startingCommit)}`,
      `- Current commit: ${git.currentCommit === null ? "None." : inlineCode(git.currentCommit)}`,
      `- Branch changed: ${git.branchChanged ? "yes" : "no"}`,
      `- HEAD changed: ${git.headChanged ? "yes" : "no"}`,
      `- Detached HEAD: ${git.detached ? "yes" : "no"}`,
      "## Working tree",
      git.workingTree === "clean" ? "Clean" : "Dirty",
      `- Staged changes: ${git.hasStagedChanges ? "yes" : "no"}`,
      `- Unstaged or untracked changes: ${git.hasUnstagedChanges ? "yes" : "no"}`,
      "## Changed paths",
      `### Added\n\n${list(git.changedPaths.added, inlineCode)}`,
      `### Modified\n\n${list(git.changedPaths.modified, inlineCode)}`,
      `### Deleted\n\n${list(git.changedPaths.deleted, inlineCode)}`,
      `### Renamed\n\n${moves(git.changedPaths.renamed)}`,
      `### Copied\n\n${moves(git.changedPaths.copied)}`,
      `### Untracked\n\n${list(git.changedPaths.untracked, inlineCode)}`,
      `### Unmerged\n\n${list(git.changedPaths.unmerged, inlineCode)}`,
      "## Diff statistics",
      `- Files changed: ${git.diffStatistics.filesChanged}`,
      `- Insertions: ${git.diffStatistics.insertions}`,
      `- Deletions: ${git.diffStatistics.deletions}`,
      `- Binary files: ${git.diffStatistics.binaryFiles}`,
      `- Untracked files: ${git.diffStatistics.untrackedFiles}`,
      "- Untracked files are not included in insertion/deletion totals.",
      `## Commits since task start\n\n${commits}`,
    ].join("\n\n"),
    [
      "# Agent-reported task state",
      `## Semantic report\n\n${semanticFreshness(checkpoint)}`,
      `## Completed\n\n${list(reported.completed)}`,
      `## In progress\n\n${list(reported.inProgress)}`,
      `## Decisions\n\n${decisions(reported.decisions)}`,
      `## Failed attempts\n\n${failedAttempts(reported.failedAttempts)}`,
      `## Blockers\n\n${list(reported.blockers)}`,
      `## Next actions\n\n${list(reported.nextActions)}`,
      `## Validation\n\n${validation(reported.validation)}`,
      `## Unverified assumptions\n\n${list(reported.assumptions)}`,
    ].join("\n\n"),
  ].join("\n\n");
}

export function serializeCheckpoint(input: Checkpoint): string {
  const checkpoint = checkpointSchema.parse(input);
  const git = checkpoint.observedGit;
  const reported = checkpoint.reportedState;
  const frontMatter = {
    schema: checkpoint.schemaVersion,
    checkpoint_id: checkpoint.checkpointId,
    task_id: checkpoint.taskId,
    task_title: checkpoint.taskTitle,
    created_at: checkpoint.createdAt,
    ...(checkpoint.checkpointAgent === undefined
      ? {}
      : { checkpoint_agent: checkpoint.checkpointAgent }),
    ...(checkpoint.lastReportingAgent === undefined
      ? {}
      : { last_reporting_agent: checkpoint.lastReportingAgent }),
    semantic_revision: checkpoint.semanticRevision,
    semantic_freshness: checkpoint.semanticFreshness,
    fingerprint: checkpoint.fingerprint,
    task_objective: checkpoint.taskObjective,
    observed_git: {
      starting_branch: git.startingBranch,
      current_branch: git.currentBranch,
      starting_commit: git.startingCommit,
      current_commit: git.currentCommit,
      detached: git.detached,
      branch_changed: git.branchChanged,
      head_changed: git.headChanged,
      working_tree: git.workingTree,
      has_staged_changes: git.hasStagedChanges,
      has_unstaged_changes: git.hasUnstagedChanges,
      changed_paths: {
        added: git.changedPaths.added,
        modified: git.changedPaths.modified,
        deleted: git.changedPaths.deleted,
        renamed: git.changedPaths.renamed,
        copied: git.changedPaths.copied,
        untracked: git.changedPaths.untracked,
        unmerged: git.changedPaths.unmerged,
      },
      diff_statistics: {
        files_changed: git.diffStatistics.filesChanged,
        insertions: git.diffStatistics.insertions,
        deletions: git.diffStatistics.deletions,
        binary_files: git.diffStatistics.binaryFiles,
        untracked_files: git.diffStatistics.untrackedFiles,
      },
      recent_commits: git.recentCommits,
      untracked_files_excluded_from_line_statistics: git.untrackedFilesExcludedFromLineStatistics,
    },
    reported_state: {
      completed: reported.completed,
      in_progress: reported.inProgress,
      decisions: reported.decisions,
      failed_attempts: reported.failedAttempts,
      blockers: reported.blockers,
      next_actions: reported.nextActions,
      validation: reported.validation,
      assumptions: reported.assumptions,
    },
  };
  const yaml = stringifyYaml(frontMatter, { indent: 2, lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${renderCheckpointBody(checkpoint)}\n`;
}
