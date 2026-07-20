import { activeTaskSchema } from "../state/active-state-schema.js";
import { agentNameSchema } from "../state/value-schemas.js";
import type { CheckpointGitFacts as ObservedGitFacts } from "../git/checkpoint-git-types.js";
import { checkpointSchema } from "./checkpoint-schema.js";
import { createCheckpointFingerprint } from "./fingerprint.js";
import type { Checkpoint } from "./types.js";
import type { ActiveTask } from "../state/types.js";

export interface AssembleCheckpointInput {
  readonly activeTask: ActiveTask;
  readonly gitFacts: ObservedGitFacts;
  readonly checkpointId: string;
  readonly createdAt: string;
  readonly checkpointAgent?: string;
}

export function assembleCheckpoint(input: AssembleCheckpointInput): Checkpoint {
  const state = activeTaskSchema.parse(input.activeTask);
  const checkpointAgent =
    input.checkpointAgent === undefined ? undefined : agentNameSchema.parse(input.checkpointAgent);
  const branchChanged = state.startingBranch !== input.gitFacts.branch;
  const headChanged = state.startingCommit !== input.gitFacts.commit;
  const semanticFreshness =
    state.reportRevision === 0
      ? "none"
      : state.reportRevision > state.checkpointHistory.latestSemanticRevision
        ? "new"
        : "reused";
  const observedGit = {
    startingBranch: state.startingBranch,
    currentBranch: input.gitFacts.branch,
    startingCommit: state.startingCommit,
    currentCommit: input.gitFacts.commit,
    detached: input.gitFacts.detached,
    branchChanged,
    headChanged,
    workingTree: input.gitFacts.workingTree,
    hasStagedChanges: input.gitFacts.hasStagedChanges,
    hasUnstagedChanges: input.gitFacts.hasUnstagedChanges,
    changedPaths: input.gitFacts.changedPaths,
    diffStatistics: input.gitFacts.diffStatistics,
    recentCommits: input.gitFacts.recentCommits,
    untrackedFilesExcludedFromLineStatistics: true as const,
  };
  const fingerprint = createCheckpointFingerprint({
    taskId: state.taskId,
    currentBranch: input.gitFacts.branch,
    currentCommit: input.gitFacts.commit,
    detached: input.gitFacts.detached,
    branchChanged,
    headChanged,
    workingTree: input.gitFacts.workingTree,
    hasStagedChanges: input.gitFacts.hasStagedChanges,
    hasUnstagedChanges: input.gitFacts.hasUnstagedChanges,
    changedPaths: input.gitFacts.changedPaths,
    diffStatistics: input.gitFacts.diffStatistics,
    recentCommits: input.gitFacts.recentCommits,
    semanticRevision: state.reportRevision,
  });

  return checkpointSchema.parse({
    schemaVersion: 1,
    checkpointId: input.checkpointId,
    taskId: state.taskId,
    taskTitle: state.title,
    taskObjective: state.objective,
    createdAt: input.createdAt,
    ...(checkpointAgent === undefined ? {} : { checkpointAgent }),
    ...(state.reportRevision === 0 || state.lastAgent === undefined
      ? {}
      : { lastReportingAgent: state.lastAgent }),
    semanticRevision: state.reportRevision,
    semanticFreshness,
    fingerprint,
    observedGit,
    reportedState: {
      completed: state.completed,
      inProgress: state.inProgress,
      decisions: state.decisions,
      failedAttempts: state.failedAttempts,
      blockers: state.blockers,
      nextActions: state.nextActions,
      validation: state.validation,
      assumptions: state.assumptions,
    },
  });
}
