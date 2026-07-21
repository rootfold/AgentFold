import { describe, expect, it } from "vitest";

import { assembleCheckpoint } from "../../src/core/checkpoints/assemble-checkpoint.js";
import {
  allocateCheckpointId,
  CheckpointSequenceExhaustedError,
} from "../../src/core/checkpoints/checkpoint-id.js";
import { checkpointSchema } from "../../src/core/checkpoints/checkpoint-schema.js";
import { createCheckpointFingerprint } from "../../src/core/checkpoints/fingerprint.js";
import {
  CheckpointParseError,
  parseCheckpoint,
} from "../../src/core/checkpoints/parse-checkpoint.js";
import { serializeCheckpoint } from "../../src/core/checkpoints/serialize-checkpoint.js";
import type { CheckpointGitFacts } from "../../src/core/git/checkpoint-git-types.js";
import { activeTaskSchema } from "../../src/core/state/active-state-schema.js";

function state(reportRevision = 2) {
  return activeTaskSchema.parse({
    schemaVersion: 1,
    taskId: "AF-20260720-001",
    title: "Implement GitHub OAuth",
    status: "active",
    startedAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T14:00:00.000Z",
    workingContext: "packages/auth app",
    startingBranch: "main",
    currentBranch: "main",
    startingCommit: "0123456789abcdef0123456789abcdef01234567",
    currentCommit: "0123456789abcdef0123456789abcdef01234567",
    startingAgent: "codex",
    lastAgent: "claude",
    reportRevision,
    latestReportAt: reportRevision === 0 ? null : "2026-07-20T14:00:00.000Z",
    objective: "Implement GitHub OAuth without changing email login.",
    completed: ["Added callback route ✓"],
    inProgress: ["Persisting café session cookie"],
    decisions: [{ decision: "Reuse session table", reason: "Avoid a migration" }],
    failedAttempts: [{ attempt: "SameSite=Strict", result: "Cookie was dropped" }],
    blockers: ["Callback test fails"],
    nextActions: ["Test SameSite=Lax"],
    validation: [{ command: "pnpm test", status: "failed", summary: "One failure" }],
    assumptions: ["HTTPS terminates at the proxy"],
    checkpointHistory: {
      count: 0,
      latestCheckpointAt: null,
      latestCheckpointId: null,
      latestFingerprint: null,
      latestSemanticRevision: 0,
    },
  });
}

function facts(overrides: Partial<CheckpointGitFacts> = {}): CheckpointGitFacts {
  return {
    branch: "feat/oauth",
    commit: "abcdef0123456789abcdef0123456789abcdef01",
    detached: false,
    workingTree: "dirty",
    hasStagedChanges: true,
    hasUnstagedChanges: true,
    changedPaths: {
      added: ["src/auth/github.ts"],
      modified: ["src/routes/auth.ts"],
      deleted: ["src/auth/unused.ts"],
      renamed: [{ from: "src/auth/old.ts", to: "src/auth/provider.ts" }],
      copied: [],
      untracked: ["tests/auth/github test.ts"],
      unmerged: [],
    },
    diffStatistics: {
      filesChanged: 4,
      insertions: 182,
      deletions: 21,
      binaryFiles: 0,
      untrackedFiles: 1,
    },
    recentCommits: [
      { hash: "abcdef0123456789abcdef0123456789abcdef01", subject: "Add callback route" },
    ],
    ...overrides,
  };
}

function checkpoint(createdAt = "2026-07-20T18:30:00.000Z") {
  return assembleCheckpoint({
    activeTask: state(),
    gitFacts: facts(),
    checkpointId: "CP-001",
    createdAt,
    checkpointAgent: "codex",
  });
}

describe("checkpoint model", () => {
  it("serializes and parses a strict checkpoint with stable section ordering", () => {
    const value = checkpoint();
    const serialized = serializeCheckpoint(value);

    expect(parseCheckpoint(serialized, value.taskId)).toEqual(value);
    expect(serializeCheckpoint(parseCheckpoint(serialized))).toBe(serialized);
    expect([...serialized.matchAll(/^# (.+)$/gmu)].map((match) => match[1])).toEqual([
      "Objective",
      "Automatically observed Git facts",
      "Agent-reported task state",
    ]);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
    expect(serialized).not.toContain("D:\\");
    expect(serialized).not.toContain("full_diff");
    expect(serialized).toContain("files_changed: 4");
    expect(serialized).toContain("in_progress:");
    expect(serialized).not.toContain("filesChanged:");
    expect(serialized).not.toContain("inProgress:");
  });

  it("handles UTF-8 BOM, CRLF, Unicode, and paths containing spaces", () => {
    const value = checkpoint();
    const input = `\uFEFF${serializeCheckpoint(value).replaceAll("\n", "\r\n")}`;

    expect(parseCheckpoint(input)).toEqual(value);
    expect(value.reportedState.completed[0]).toContain("✓");
    expect(value.observedGit.changedPaths.untracked[0]).toContain(" ");
  });

  it("loads existing checkpoints without lifecycle fields as progress checkpoints", () => {
    const value = checkpoint();
    const legacy = serializeCheckpoint(value).replace("kind: progress\n", "");

    expect(parseCheckpoint(legacy)).toEqual(value);
  });

  it("rejects invalid versions, IDs, task mismatches, complete-diff fields, and body drift", () => {
    const value = checkpoint();
    const serialized = serializeCheckpoint(value);

    expect(() => parseCheckpoint(serialized.replace("schema: 1", "schema: 2"))).toThrow(
      CheckpointParseError,
    );
    expect(() =>
      parseCheckpoint(serialized.replace("checkpoint_id: CP-001", "checkpoint_id: x")),
    ).toThrow(CheckpointParseError);
    expect(() => parseCheckpoint(serialized, "AF-20260720-002")).toThrow(/Expected/u);
    expect(checkpointSchema.safeParse({ ...value, fullDiff: "forbidden" }).success).toBe(false);
    expect(() => parseCheckpoint(serialized.replace("# Objective", "# Changed objective"))).toThrow(
      /body/u,
    );
    expect(
      checkpointSchema.safeParse({
        ...value,
        observedGit: {
          ...value.observedGit,
          startingBranch: value.observedGit.currentBranch,
        },
      }).success,
    ).toBe(false);
  });

  it("allocates the next deterministic checkpoint ID without reuse", () => {
    expect(allocateCheckpointId("AF-20260720-001", 1, [])).toEqual({
      checkpointId: "CP-002",
      fileName: "AF-20260720-001-CP-002.md",
    });
    expect(
      allocateCheckpointId("AF-20260720-001", 0, [
        "AF-20260720-001-CP-001.md",
        "AF-20260720-001-CP-004.md",
        "AF-20260720-002-CP-099.md",
      ]).checkpointId,
    ).toBe("CP-005");
    expect(() => allocateCheckpointId("AF-20260720-001", 999, [])).toThrow(
      CheckpointSequenceExhaustedError,
    );
  });
});

describe("checkpoint fingerprints", () => {
  it("distinguishes final lifecycle checkpoints even when Git and semantic state are unchanged", () => {
    const progress = checkpoint();
    const final = assembleCheckpoint({
      activeTask: state(),
      gitFacts: facts(),
      checkpointId: "CP-002",
      createdAt: progress.createdAt,
      checkpointAgent: "codex",
      kind: "final",
    });

    expect(final).toMatchObject({ kind: "final", taskStatus: "completed" });
    expect(final.fingerprint).not.toBe(progress.fingerprint);
    expect(parseCheckpoint(serializeCheckpoint(final))).toEqual(final);
  });

  it("ignores timestamp and checkpointing agent but changes for meaningful inputs", () => {
    const first = checkpoint("2026-07-20T18:30:00.000Z");
    const later = assembleCheckpoint({
      activeTask: state(),
      gitFacts: facts(),
      checkpointId: "CP-099",
      createdAt: "2026-07-21T18:30:00.000Z",
      checkpointAgent: "gemini",
    });
    expect(later.fingerprint).toBe(first.fingerprint);

    const variations = [
      facts({ branch: "other" }),
      facts({ commit: null }),
      facts({ changedPaths: { ...facts().changedPaths, added: ["src/other.ts"] } }),
      facts({ diffStatistics: { ...facts().diffStatistics, insertions: 183 } }),
    ];
    for (const variation of variations) {
      expect(
        assembleCheckpoint({
          activeTask: state(),
          gitFacts: variation,
          checkpointId: "CP-001",
          createdAt: first.createdAt,
        }).fingerprint,
      ).not.toBe(first.fingerprint);
    }
    expect(
      assembleCheckpoint({
        activeTask: state(3),
        gitFacts: facts(),
        checkpointId: "CP-001",
        createdAt: first.createdAt,
      }).fingerprint,
    ).not.toBe(first.fingerprint);
  });

  it("normalizes Windows and POSIX path representations and ignores extra root data", () => {
    const base = checkpoint();
    const input = {
      taskId: base.taskId,
      currentBranch: base.observedGit.currentBranch,
      currentCommit: base.observedGit.currentCommit,
      detached: base.observedGit.detached,
      branchChanged: base.observedGit.branchChanged,
      headChanged: base.observedGit.headChanged,
      workingTree: base.observedGit.workingTree,
      hasStagedChanges: base.observedGit.hasStagedChanges,
      hasUnstagedChanges: base.observedGit.hasUnstagedChanges,
      changedPaths: base.observedGit.changedPaths,
      diffStatistics: base.observedGit.diffStatistics,
      recentCommits: base.observedGit.recentCommits,
      semanticRevision: base.semanticRevision,
    };
    const windows = {
      ...input,
      repositoryRoot: "C:\\machine\\repo",
      changedPaths: { ...input.changedPaths, added: ["src\\auth\\github.ts"] },
    };
    const posix = {
      ...input,
      repositoryRoot: "/another/machine/repo",
      changedPaths: { ...input.changedPaths, added: ["src/auth/github.ts"] },
    };

    expect(createCheckpointFingerprint(windows)).toBe(createCheckpointFingerprint(posix));
  });

  it("treats detached HEAD as meaningful and rejects an empty normalized Git path", () => {
    const attached = checkpoint();
    const detached = assembleCheckpoint({
      activeTask: state(),
      gitFacts: facts({ detached: true }),
      checkpointId: "CP-001",
      createdAt: attached.createdAt,
    });

    expect(detached.fingerprint).not.toBe(attached.fingerprint);
    expect(() =>
      assembleCheckpoint({
        activeTask: state(),
        gitFacts: facts({ changedPaths: { ...facts().changedPaths, added: ["."] } }),
        checkpointId: "CP-001",
        createdAt: attached.createdAt,
      }),
    ).toThrow(/unsafe repository path/u);
  });
});
