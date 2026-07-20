import { resumePacketSchema } from "./resume-packet-schema.js";
import type { ResumePacket, ResumePacketTruncationResult } from "./types.js";

export const resumePacketLimits = {
  projectSummaryCharacters: 500,
  changedPaths: 50,
  recentCommits: 20,
  semanticItemsPerCategory: 50,
  validationEntries: 20,
  safetyInstructions: 12,
  excludedPaths: 20,
  maximumEntryCharacters: 2_000,
  variableCharacters: 12_000,
  maximumMarkdownCharacters: 30_000,
} as const;

type SemanticKey = keyof ResumePacket["omitted"]["semantic"];
type PathKey = keyof ResumePacket["omitted"]["changedPaths"];

function safeSummary(input: string): { readonly value: string; readonly omitted: number } {
  const maximum = resumePacketLimits.projectSummaryCharacters;
  if (input.length <= maximum) return { value: input, omitted: 0 };

  let cutoff = maximum - "...".length;
  const markerStart = input.lastIndexOf("[REDACTED]", cutoff);
  if (markerStart >= 0 && markerStart + "[REDACTED]".length > cutoff) cutoff = markerStart;
  const wordBoundary = input.lastIndexOf(" ", cutoff);
  if (wordBoundary >= Math.floor(maximum * 0.75)) cutoff = wordBoundary;
  const value = `${input.slice(0, cutoff).trimEnd()}...`;
  return { value, omitted: input.length - cutoff };
}

function itemCost(value: unknown): number {
  return JSON.stringify(value).length + 32;
}

function itemLength(value: unknown): number {
  return JSON.stringify(value).length;
}

export function truncateResumePacket(input: ResumePacket): ResumePacketTruncationResult {
  const packet = resumePacketSchema.parse(input);
  let remainingCharacters = resumePacketLimits.variableCharacters;
  const reduced = new Set<string>();
  const summary = safeSummary(packet.project.summary);
  if (summary.omitted > 0) reduced.add("project summary");

  function select<T>(
    items: readonly T[],
    maximum: number,
    category: string,
  ): { readonly values: readonly T[]; readonly omitted: number } {
    const values: T[] = [];
    for (const item of items) {
      const cost = itemCost(item);
      if (
        values.length >= maximum ||
        cost > remainingCharacters ||
        itemLength(item) > resumePacketLimits.maximumEntryCharacters
      )
        continue;
      values.push(item);
      remainingCharacters -= cost;
    }
    const omitted = items.length - values.length;
    if (omitted > 0) reduced.add(category);
    return { values, omitted };
  }

  const safetyInstructions = select(
    packet.safety.instructions,
    resumePacketLimits.safetyInstructions,
    "safety instructions",
  );
  const excludedPaths = select(
    packet.safety.excludedPaths,
    resumePacketLimits.excludedPaths,
    "excluded paths",
  );

  const semanticPriority: readonly SemanticKey[] = [
    "blockers",
    "nextActions",
    "failedAttempts",
    "validation",
    "decisions",
    "inProgress",
    "completed",
    "assumptions",
  ];
  const validationPriority = { failed: 0, warning: 1, not_run: 2, passed: 3 } as const;
  const semanticSource = {
    ...packet.semanticState,
    validation: packet.semanticState.validation
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) =>
          validationPriority[left.entry.status] - validationPriority[right.entry.status] ||
          left.index - right.index,
      )
      .map(({ entry }) => entry),
  };
  const blockers = select(
    semanticSource.blockers,
    resumePacketLimits.semanticItemsPerCategory,
    "blockers",
  );
  const nextActions = select(
    semanticSource.nextActions,
    resumePacketLimits.semanticItemsPerCategory,
    "nextActions",
  );
  const failedAttempts = select(
    semanticSource.failedAttempts,
    resumePacketLimits.semanticItemsPerCategory,
    "failedAttempts",
  );
  const validation = select(
    semanticSource.validation,
    resumePacketLimits.validationEntries,
    "validation",
  );
  const decisions = select(
    semanticSource.decisions,
    resumePacketLimits.semanticItemsPerCategory,
    "decisions",
  );
  const inProgress = select(
    semanticSource.inProgress,
    resumePacketLimits.semanticItemsPerCategory,
    "inProgress",
  );
  const completed = select(
    semanticSource.completed,
    resumePacketLimits.semanticItemsPerCategory,
    "completed",
  );
  const assumptions = select(
    semanticSource.assumptions,
    resumePacketLimits.semanticItemsPerCategory,
    "assumptions",
  );
  const semanticSelections = {
    completed,
    inProgress,
    decisions,
    failedAttempts,
    blockers,
    nextActions,
    validation,
    assumptions,
  };

  const selectedPaths: Partial<Record<PathKey, readonly unknown[]>> = {};
  const omittedPaths: Partial<Record<PathKey, number>> = {};
  let remainingPathSlots = resumePacketLimits.changedPaths;
  const pathKeys: readonly PathKey[] = [
    "added",
    "modified",
    "deleted",
    "renamed",
    "copied",
    "untracked",
    "unmerged",
  ];
  for (const key of pathKeys) {
    const selection = select<unknown>(
      packet.observedGitState.changedPaths[key] as readonly unknown[],
      remainingPathSlots,
      `${key} paths`,
    );
    selectedPaths[key] = selection.values;
    omittedPaths[key] = packet.omitted.changedPaths[key] + selection.omitted;
    remainingPathSlots -= selection.values.length;
  }
  const recentCommits = select(
    packet.observedGitState.recentCommits,
    resumePacketLimits.recentCommits,
    "recent commits",
  );

  const selectedCommands: Record<string, string> = {};
  let omittedCommands = packet.omitted.projectCommands;
  for (const [name, command] of Object.entries(packet.projectCommands)) {
    const selection = select([command], 1, "project commands");
    if (selection.values[0] === undefined) omittedCommands += 1;
    else selectedCommands[name] = selection.values[0];
  }

  const semantic = {
    ...packet.semanticState,
    completed: semanticSelections.completed.values,
    inProgress: semanticSelections.inProgress.values,
    decisions: semanticSelections.decisions.values,
    failedAttempts: semanticSelections.failedAttempts.values,
    blockers: semanticSelections.blockers.values,
    nextActions: semanticSelections.nextActions.values,
    validation: semanticSelections.validation.values,
    assumptions: semanticSelections.assumptions.values,
  };
  const omittedSemantic = Object.fromEntries(
    semanticPriority.map((key) => [
      key,
      packet.omitted.semantic[key] + semanticSelections[key].omitted,
    ]),
  );
  const result = resumePacketSchema.parse({
    ...packet,
    project: { ...packet.project, summary: summary.value },
    observedGitState: {
      ...packet.observedGitState,
      changedPaths: selectedPaths,
      recentCommits: recentCommits.values,
    },
    semanticState: semantic,
    projectCommands: selectedCommands,
    safety: {
      instructions: safetyInstructions.values,
      excludedPaths: excludedPaths.values,
    },
    omitted: {
      projectSummaryCharacters: packet.omitted.projectSummaryCharacters + summary.omitted,
      safetyInstructions: packet.omitted.safetyInstructions + safetyInstructions.omitted,
      excludedPaths: packet.omitted.excludedPaths + excludedPaths.omitted,
      projectCommands: omittedCommands,
      changedPaths: omittedPaths,
      recentCommits: packet.omitted.recentCommits + recentCommits.omitted,
      semantic: omittedSemantic,
    },
  });
  const hasOmissions = JSON.stringify(result.omitted).match(/[1-9]/u) !== null;
  return {
    packet: result,
    truncated: hasOmissions,
    reducedCategories: [...reduced],
  };
}
