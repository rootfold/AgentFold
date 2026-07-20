import { stringify as stringifyYaml } from "yaml";

import { activeTaskSchema } from "./active-state-schema.js";
import type { ActiveTask, Decision, FailedAttempt, ValidationResult } from "./types.js";

function stringList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function decisions(items: readonly Decision[]): string {
  return items
    .map(
      (item, index) =>
        `## Entry ${index + 1}\n\nDecision: ${item.decision}\nReason: ${item.reason}`,
    )
    .join("\n\n");
}

function failedAttempts(items: readonly FailedAttempt[]): string {
  return items
    .map(
      (item, index) => `## Entry ${index + 1}\n\nAttempt: ${item.attempt}\nResult: ${item.result}`,
    )
    .join("\n\n");
}

function validation(items: readonly ValidationResult[]): string {
  return items
    .map(
      (item, index) =>
        `## Entry ${index + 1}\n\nCommand: ${item.command}\nStatus: ${item.status}\nSummary: ${item.summary}`,
    )
    .join("\n\n");
}

export function serializeActiveState(input: ActiveTask): string {
  const state = activeTaskSchema.parse(input);
  const frontMatter = {
    schema: state.schemaVersion,
    task_id: state.taskId,
    title: state.title,
    status: state.status,
    started_at: state.startedAt,
    updated_at: state.updatedAt,
    working_context: state.workingContext,
    starting_branch: state.startingBranch,
    current_branch: state.currentBranch,
    starting_commit: state.startingCommit,
    current_commit: state.currentCommit,
    ...(state.startingAgent === undefined ? {} : { starting_agent: state.startingAgent }),
    ...(state.lastAgent === undefined ? {} : { last_agent: state.lastAgent }),
    report_revision: state.reportRevision,
    latest_report_at: state.latestReportAt,
    checkpoint_history: {
      count: state.checkpointHistory.count,
      latest_checkpoint_at: state.checkpointHistory.latestCheckpointAt,
      latest_checkpoint_id: state.checkpointHistory.latestCheckpointId,
      latest_fingerprint: state.checkpointHistory.latestFingerprint,
      latest_semantic_revision: state.checkpointHistory.latestSemanticRevision,
    },
  };
  const yaml = stringifyYaml(frontMatter, { indent: 2, lineWidth: 0 }).trimEnd();
  const sections = [
    ["Objective", `> ${state.objective}`],
    ["Completed", stringList(state.completed)],
    ["In progress", stringList(state.inProgress)],
    ["Decisions", decisions(state.decisions)],
    ["Failed attempts", failedAttempts(state.failedAttempts)],
    ["Blockers", stringList(state.blockers)],
    ["Next actions", stringList(state.nextActions)],
    ["Validation", validation(state.validation)],
    ["Unverified assumptions", stringList(state.assumptions)],
  ] as const;
  const body = sections.map(([heading, content]) => `# ${heading}\n\n${content}`).join("\n\n");

  return `---\n${yaml}\n---\n\n${body}\n`;
}
