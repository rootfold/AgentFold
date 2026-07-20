import { describe, expect, it } from "vitest";

import { activeTaskSchema } from "../../src/core/state/active-state-schema.js";
import {
  ActiveStateParseError,
  parseActiveState,
} from "../../src/core/state/parse-active-state.js";
import { serializeActiveState } from "../../src/core/state/serialize-active-state.js";
import { generateTaskId } from "../../src/core/state/task-id.js";
import type { ActiveTask } from "../../src/core/state/types.js";

function state(): ActiveTask {
  return activeTaskSchema.parse({
    schemaVersion: 1,
    taskId: "AF-20260720-001",
    title: "Implement GitHub OAuth",
    status: "active",
    startedAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T13:00:00.000Z",
    workingContext: "packages/example app",
    startingBranch: "feat/oauth",
    currentBranch: "feat/oauth",
    startingCommit: "0123456789abcdef0123456789abcdef01234567",
    currentCommit: "0123456789abcdef0123456789abcdef01234567",
    startingAgent: "codex",
    lastAgent: "codex",
    objective: "Implement GitHub OAuth without changing email login.",
    completed: ["Added provider configuration."],
    inProgress: ["Persisting the session cookie."],
    decisions: [{ decision: "Reuse the session table", reason: "Avoid a data migration" }],
    failedAttempts: [
      { attempt: "Used SameSite=Strict", result: "Cookie did not survive redirect" },
    ],
    blockers: ["Callback test fails."],
    nextActions: ["Test SameSite=Lax."],
    validation: [{ command: "pnpm lint", status: "passed", summary: "No lint errors" }],
    assumptions: ["Production terminates HTTPS at the proxy."],
    checkpointHistory: { count: 0, latestCheckpointAt: null },
  });
}

describe("active task state", () => {
  it("serializes and parses every typed field deterministically", () => {
    const serialized = serializeActiveState(state());

    expect(parseActiveState(serialized)).toEqual(state());
    expect(serializeActiveState(parseActiveState(serialized))).toBe(serialized);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
  });

  it("uses stable Markdown section ordering", () => {
    const serialized = serializeActiveState(state());
    const headings = [...serialized.matchAll(/^# (.+)$/gmu)].map((match) => match[1]);

    expect(headings).toEqual([
      "Objective",
      "Completed",
      "In progress",
      "Decisions",
      "Failed attempts",
      "Blockers",
      "Next actions",
      "Validation",
      "Unverified assumptions",
    ]);
  });

  it("handles UTF-8 BOM, CRLF, and Unicode", () => {
    const unicode = activeTaskSchema.parse({
      ...state(),
      title: "Fix café authentication ✓",
      objective: "Preserve 日本語 text.",
    });
    const input = `\uFEFF${serializeActiveState(unicode).replaceAll("\n", "\r\n")}`;

    expect(parseActiveState(input)).toEqual(unicode);
  });

  it("rejects invalid schema versions and task statuses", () => {
    const serialized = serializeActiveState(state());

    expect(() => parseActiveState(serialized.replace("schema: 1", "schema: 2"))).toThrow(
      ActiveStateParseError,
    );
    expect(() => parseActiveState(serialized.replace("status: active", "status: paused"))).toThrow(
      ActiveStateParseError,
    );
  });

  it("rejects missing front-matter fields and malformed YAML", () => {
    const serialized = serializeActiveState(state());

    expect(() => parseActiveState(serialized.replace(/^task_id:.*\n/mu, ""))).toThrow(
      ActiveStateParseError,
    );
    expect(() => parseActiveState(serialized.replace("schema: 1", "schema: ["))).toThrow(
      ActiveStateParseError,
    );
  });

  it("rejects a missing required Markdown section", () => {
    const serialized = serializeActiveState(state());
    const withoutBlockers = serialized.replace(/# Blockers\n\n[\s\S]*?(?=# Next actions)/u, "");

    expect(() => parseActiveState(withoutBlockers)).toThrow(ActiveStateParseError);
  });

  it("preserves repository-relative working context and rejects absolute paths", () => {
    expect(parseActiveState(serializeActiveState(state())).workingContext).toBe(
      "packages/example app",
    );
    expect(() =>
      activeTaskSchema.parse({ ...state(), workingContext: "C:\\Users\\secret" }),
    ).toThrow();
    expect(serializeActiveState(state())).not.toContain("C:\\Users");
  });

  it("generates deterministic date-sequenced task IDs", () => {
    const date = new Date("2026-07-20T23:59:00.000Z");

    expect(generateTaskId(date, [])).toBe("AF-20260720-001");
    expect(generateTaskId(date, ["AF-20260720-001", "AF-20260720-004", "AF-20260719-999"])).toBe(
      "AF-20260720-005",
    );
  });
});
