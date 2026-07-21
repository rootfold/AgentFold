import { describe, expect, it } from "vitest";

import { completedTaskSchema } from "../../src/core/completion/completed-task-schema.js";
import {
  CompletedTaskParseError,
  parseCompletedTask,
} from "../../src/core/completion/parse-completed-task.js";
import { serializeCompletedTask } from "../../src/core/completion/serialize-completed-task.js";

function completedTask() {
  return completedTaskSchema.parse({
    schemaVersion: 1,
    taskId: "AF-20260721-001",
    title: "Finish OAuth café flow",
    objective: "Complete OAuth without changing email login.",
    status: "completed",
    startedAt: "2026-07-21T01:00:00.000Z",
    finishedAt: "2026-07-21T01:01:30.500Z",
    durationSeconds: 90,
    startingBranch: "main",
    startingCommit: "0123456789abcdef0123456789abcdef01234567",
    finalBranch: "feat/oauth",
    finalCommit: "abcdef0123456789abcdef0123456789abcdef01",
    startingAgent: "codex",
    lastReportingAgent: "antigravity",
    finishingAgent: "codex",
    summary: "Implemented and validated OAuth ✓.",
    completed: ["Added callback route"],
    decisions: [{ decision: "Reuse sessions", reason: "Avoid migration" }],
    failedAttempts: [{ attempt: "Strict cookie", result: "Redirect dropped it" }],
    validation: [{ command: "pnpm test", status: "passed", summary: "All passed" }],
    assumptions: ["TLS terminates at proxy"],
    finalCheckpointId: "CP-002",
    checkpointCount: 2,
    semanticRevision: 3,
    changedPaths: {
      added: ["src/auth/callback.ts"],
      modified: ["tests/oauth flow.test.ts"],
      deleted: [],
      renamed: [],
      copied: [],
      untracked: [],
      unmerged: [],
    },
    diffStatistics: {
      filesChanged: 2,
      insertions: 42,
      deletions: 3,
      binaryFiles: 0,
      untrackedFiles: 0,
    },
    followUp: ["Consider provider metrics later"],
  });
}

describe("completed task model", () => {
  it("round trips deterministic Markdown with stable ordering and one final newline", () => {
    const task = completedTask();
    const serialized = serializeCompletedTask(task);

    expect(parseCompletedTask(serialized, task.taskId)).toEqual(task);
    expect(serializeCompletedTask(parseCompletedTask(serialized))).toBe(serialized);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
    expect(serialized).not.toContain("full_diff");
    expect([...serialized.matchAll(/^# (.+)$/gmu)].map((match) => match[1])).toEqual([
      "Completion summary",
      "Completed work",
      "Decisions",
      "Failed attempts",
      "Final validation",
      "Unverified assumptions",
      "Follow-up",
      "Final Git summary",
    ]);
  });

  it("accepts UTF-8 BOM and CRLF while preserving Unicode and spaces", () => {
    const task = completedTask();
    const source = `\uFEFF${serializeCompletedTask(task).replaceAll("\n", "\r\n")}`;

    expect(parseCompletedTask(source)).toEqual(task);
    expect(task.summary).toContain("✓");
    expect(task.changedPaths.modified[0]).toContain(" ");
  });

  it("strictly rejects metadata drift, invalid duration, and body changes", () => {
    const task = completedTask();
    const serialized = serializeCompletedTask(task);

    expect(() => parseCompletedTask(serialized, "AF-20260721-002")).toThrow(/Expected/u);
    expect(() =>
      parseCompletedTask(serialized.replace("duration_seconds: 90", "duration_seconds: 2")),
    ).toThrow(CompletedTaskParseError);
    expect(() => parseCompletedTask(serialized.replace("# Completed work", "# Work"))).toThrow(
      /body/u,
    );
    expect(completedTaskSchema.safeParse({ ...task, sourceContents: "secret" }).success).toBe(
      false,
    );
  });
});
