import { stringify as stringifyYaml } from "yaml";

import { completedTaskSchema } from "./completed-task-schema.js";
import type { CompletedTask } from "./types.js";

function list(items: readonly string[]): string {
  return items.length === 0 ? "None." : items.map((item) => `- ${item}`).join("\n");
}

function decisions(items: CompletedTask["decisions"]): string {
  return items.length === 0
    ? "None."
    : items
        .map(
          (item, index) =>
            `## Entry ${index + 1}\n\nDecision: ${item.decision}\nReason: ${item.reason}`,
        )
        .join("\n\n");
}

function failedAttempts(items: CompletedTask["failedAttempts"]): string {
  return items.length === 0
    ? "None."
    : items
        .map(
          (item, index) =>
            `## Entry ${index + 1}\n\nAttempt: ${item.attempt}\nResult: ${item.result}`,
        )
        .join("\n\n");
}

function validation(items: CompletedTask["validation"]): string {
  return items.length === 0
    ? "None."
    : items.map((item) => `- ${item.command} — ${item.status}: ${item.summary}`).join("\n");
}

export function renderCompletedTaskBody(task: CompletedTask): string {
  const paths = task.changedPaths;
  return [
    `# Completion summary\n\n> ${task.summary}`,
    `# Completed work\n\n${list(task.completed)}`,
    `# Decisions\n\n${decisions(task.decisions)}`,
    `# Failed attempts\n\n${failedAttempts(task.failedAttempts)}`,
    `# Final validation\n\n${validation(task.validation)}`,
    `# Unverified assumptions\n\n${list(task.assumptions)}`,
    `# Follow-up\n\n${list(task.followUp)}`,
    [
      "# Final Git summary",
      `- Branch: ${task.finalBranch}`,
      `- Commit: ${task.finalCommit ?? "None."}`,
      `- Added paths: ${paths.added.length}`,
      `- Modified paths: ${paths.modified.length}`,
      `- Deleted paths: ${paths.deleted.length}`,
      `- Renamed paths: ${paths.renamed.length}`,
      `- Copied paths: ${paths.copied.length}`,
      `- Untracked paths: ${paths.untracked.length}`,
      `- Unmerged paths: ${paths.unmerged.length}`,
      `- Files changed: ${task.diffStatistics.filesChanged}`,
      `- Insertions: ${task.diffStatistics.insertions}`,
      `- Deletions: ${task.diffStatistics.deletions}`,
      `- Binary files: ${task.diffStatistics.binaryFiles}`,
      `- Untracked files: ${task.diffStatistics.untrackedFiles}`,
    ].join("\n"),
  ].join("\n\n");
}

export function serializeCompletedTask(input: CompletedTask): string {
  const task = completedTaskSchema.parse(input);
  const frontMatter = {
    schema: task.schemaVersion,
    task_id: task.taskId,
    title: task.title,
    status: task.status,
    started_at: task.startedAt,
    finished_at: task.finishedAt,
    duration_seconds: task.durationSeconds,
    objective: task.objective,
    starting_git: { branch: task.startingBranch, commit: task.startingCommit },
    final_git: { branch: task.finalBranch, commit: task.finalCommit },
    agents: {
      starting: task.startingAgent,
      last_reporting: task.lastReportingAgent,
      finishing: task.finishingAgent,
    },
    final_checkpoint_id: task.finalCheckpointId,
    checkpoint_count: task.checkpointCount,
    semantic_revision: task.semanticRevision,
    summary: task.summary,
    completed: task.completed,
    decisions: task.decisions,
    failed_attempts: task.failedAttempts,
    validation: task.validation,
    assumptions: task.assumptions,
    changed_paths: task.changedPaths,
    diff_statistics: task.diffStatistics,
    follow_up: task.followUp,
  };
  const yaml = stringifyYaml(frontMatter, { indent: 2, lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${renderCompletedTaskBody(task)}\n`;
}
