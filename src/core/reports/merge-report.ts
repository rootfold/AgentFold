import { activeTaskSchema } from "../state/active-state-schema.js";
import type { GitWorkingFacts } from "../git/git-inspector.js";
import type { ActiveTask } from "../state/types.js";
import type { AgentReport, ReportMergeSummary } from "./types.js";

function appendUnique<T>(
  existing: readonly T[],
  incoming: readonly T[],
  key: (value: T) => string,
): { readonly values: readonly T[]; readonly added: number } {
  const seen = new Set(existing.map(key));
  const additions: T[] = [];

  for (const item of incoming) {
    const itemKey = key(item);
    if (!seen.has(itemKey)) {
      seen.add(itemKey);
      additions.push(item);
    }
  }

  return { values: [...existing, ...additions], added: additions.length };
}

export interface MergeAgentReportOptions {
  readonly updatedAt: string;
  readonly gitFacts: GitWorkingFacts;
}

export interface MergeAgentReportResult {
  readonly state: ActiveTask;
  readonly summary: ReportMergeSummary;
}

export function mergeAgentReport(
  state: ActiveTask,
  report: AgentReport,
  options: MergeAgentReportOptions,
): MergeAgentReportResult {
  const completed = appendUnique(state.completed, report.completed, String);
  const inProgress = appendUnique(state.inProgress, report.inProgress, String);
  const decisions = appendUnique(state.decisions, report.decisions, (item) =>
    JSON.stringify([item.decision, item.reason]),
  );
  const failedAttempts = appendUnique(state.failedAttempts, report.failedAttempts, (item) =>
    JSON.stringify([item.attempt, item.result]),
  );
  const blockers = appendUnique(state.blockers, report.blockers, String);
  const nextActions = appendUnique(state.nextActions, report.nextActions, String);
  const validation = appendUnique(state.validation, report.validation, (item) =>
    JSON.stringify([item.command, item.status, item.summary]),
  );
  const assumptions = appendUnique(state.assumptions, report.assumptions, String);

  return {
    state: activeTaskSchema.parse({
      ...state,
      updatedAt: options.updatedAt,
      currentBranch: options.gitFacts.branch,
      currentCommit: options.gitFacts.commit,
      ...(report.agent === undefined ? {} : { lastAgent: report.agent }),
      completed: completed.values,
      inProgress: inProgress.values,
      decisions: decisions.values,
      failedAttempts: failedAttempts.values,
      blockers: blockers.values,
      nextActions: nextActions.values,
      validation: validation.values,
      assumptions: assumptions.values,
    }),
    summary: {
      completed: completed.added,
      inProgress: inProgress.added,
      decisions: decisions.added,
      failedAttempts: failedAttempts.added,
      blockers: blockers.added,
      nextActions: nextActions.added,
      validation: validation.added,
      assumptions: assumptions.added,
    },
  };
}
