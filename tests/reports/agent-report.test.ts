import { describe, expect, it } from "vitest";

import { agentReportSchema } from "../../src/core/reports/agent-report-schema.js";
import { mergeAgentReport } from "../../src/core/reports/merge-report.js";
import {
  AgentReportValidationError,
  parseAgentReport,
  privateReasoningFields,
} from "../../src/core/reports/parse-agent-report.js";
import { redactAgentReport } from "../../src/core/reports/redact-secrets.js";
import { activeTaskSchema } from "../../src/core/state/active-state-schema.js";

function validReport(): unknown {
  return {
    agent: " codex ",
    completed: [" Added callback route "],
    inProgress: ["Persisting the session cookie"],
    decisions: [{ decision: "Reuse session table", reason: "Avoid a migration" }],
    failedAttempts: [{ attempt: "Used Strict cookies", result: "Redirect dropped cookie" }],
    blockers: ["Callback test fails"],
    nextActions: ["Test Lax cookies"],
    validation: [{ command: "pnpm lint", status: "passed", summary: "No errors" }],
    assumptions: ["HTTPS terminates at proxy"],
  };
}

function activeState() {
  return activeTaskSchema.parse({
    schemaVersion: 1,
    taskId: "AF-20260720-001",
    title: "OAuth",
    status: "active",
    startedAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z",
    workingContext: ".",
    startingBranch: "main",
    currentBranch: "main",
    startingCommit: "0123456789abcdef0123456789abcdef01234567",
    currentCommit: "0123456789abcdef0123456789abcdef01234567",
    objective: "Keep the objective",
    completed: ["Existing completion"],
    inProgress: [],
    decisions: [{ decision: "Existing decision", reason: "Existing reason" }],
    failedAttempts: [],
    blockers: ["Existing blocker"],
    nextActions: ["Existing action"],
    validation: [],
    assumptions: ["Existing assumption"],
    checkpointHistory: { count: 0, latestCheckpointAt: null },
  });
}

describe("agent report schema", () => {
  it("accepts a useful strict report and trims semantic text", () => {
    const report = parseAgentReport(validReport());

    expect(report.agent).toBe("codex");
    expect(report.completed).toEqual(["Added callback route"]);
    expect(report.decisions[0]).toEqual({
      decision: "Reuse session table",
      reason: "Avoid a migration",
    });
  });

  it("rejects empty reports, empty strings, and unknown validation statuses", () => {
    expect(() => parseAgentReport({ agent: "codex" })).toThrow(AgentReportValidationError);
    expect(() => parseAgentReport({ completed: ["   "] })).toThrow(AgentReportValidationError);
    expect(() =>
      parseAgentReport({
        validation: [{ command: "pnpm test", status: "unknown", summary: "No result" }],
      }),
    ).toThrow(AgentReportValidationError);
  });

  it("enforces text and array limits", () => {
    expect(() => parseAgentReport({ completed: ["x".repeat(2_001)] })).toThrow(
      AgentReportValidationError,
    );
    expect(() =>
      parseAgentReport({ completed: Array.from({ length: 101 }, () => "item") }),
    ).toThrow(AgentReportValidationError);
  });

  it.each(privateReasoningFields)("rejects private-reasoning field %s", (field) => {
    expect(() => parseAgentReport({ completed: ["Safe conclusion"], [field]: "private" })).toThrow(
      /Private reasoning/u,
    );
  });

  it("accepts a concise engineering reason inside a decision", () => {
    expect(
      parseAgentReport({
        decisions: [{ decision: "Reuse the table", reason: "Avoid changing the data model" }],
      }).decisions,
    ).toHaveLength(1);
  });

  it("exports the strict Zod boundary", () => {
    expect(agentReportSchema.safeParse({ completed: ["Done"], unsupported: true }).success).toBe(
      false,
    );
  });
});

describe("report merge", () => {
  it("appends new entries, preserves old conclusions, deduplicates, and keeps report order", () => {
    const state = activeState();
    const report = parseAgentReport({
      agent: "claude",
      completed: ["Existing completion", "New completion 1", "New completion 2"],
      decisions: [
        { decision: "Existing decision", reason: "Existing reason" },
        { decision: "Existing decision", reason: "Different reason" },
      ],
      failedAttempts: [
        { attempt: "Attempt A", result: "Result A" },
        { attempt: "Attempt A", result: "Result A" },
      ],
      blockers: ["Existing blocker", "New blocker"],
      nextActions: ["Existing action", "New action"],
      validation: [
        { command: "pnpm test", status: "failed", summary: "One failure" },
        { command: "pnpm test", status: "failed", summary: "One failure" },
      ],
      assumptions: ["Existing assumption", "New assumption"],
    });

    const merged = mergeAgentReport(state, report, {
      updatedAt: "2026-07-20T14:00:00.000Z",
      gitFacts: { branch: "feat/oauth", commit: null, detached: false },
    });

    expect(merged.state.objective).toBe("Keep the objective");
    expect(merged.state.startingBranch).toBe("main");
    expect(merged.state.startingCommit).toBe(state.startingCommit);
    expect(merged.state.currentBranch).toBe("feat/oauth");
    expect(merged.state.currentCommit).toBeNull();
    expect(merged.state.lastAgent).toBe("claude");
    expect(merged.state.updatedAt).toBe("2026-07-20T14:00:00.000Z");
    expect(merged.state.reportRevision).toBe(1);
    expect(merged.state.latestReportAt).toBe("2026-07-20T14:00:00.000Z");
    expect(merged.state.completed).toEqual([
      "Existing completion",
      "New completion 1",
      "New completion 2",
    ]);
    expect(merged.state.decisions).toHaveLength(2);
    expect(merged.state.failedAttempts).toEqual([{ attempt: "Attempt A", result: "Result A" }]);
    expect(merged.state.blockers).toEqual(["Existing blocker", "New blocker"]);
    expect(merged.state.nextActions).toEqual(["Existing action", "New action"]);
    expect(merged.state.validation).toHaveLength(1);
    expect(merged.state.assumptions).toEqual(["Existing assumption", "New assumption"]);
    expect(merged.summary).toMatchObject({
      completed: 2,
      decisions: 1,
      failedAttempts: 1,
      blockers: 1,
      nextActions: 1,
      validation: 1,
      assumptions: 1,
    });
  });

  it("deduplicates after trimming while keeping comparisons case-sensitive", () => {
    const state = activeState();
    const report = parseAgentReport({
      completed: [" Existing completion ", "existing completion"],
      decisions: [
        { decision: " Existing decision ", reason: " Existing reason " },
        { decision: "existing decision", reason: "Existing reason" },
      ],
    });

    const merged = mergeAgentReport(state, report, {
      updatedAt: "2026-07-20T14:00:00.000Z",
      gitFacts: { branch: "main", commit: null, detached: false },
    });

    expect(merged.state.completed).toEqual(["Existing completion", "existing completion"]);
    expect(merged.state.decisions).toEqual([
      { decision: "Existing decision", reason: "Existing reason" },
      { decision: "existing decision", reason: "Existing reason" },
    ]);
  });

  it("does not increment the semantic revision for a duplicate-only report", () => {
    const original = activeTaskSchema.parse({
      ...activeState(),
      reportRevision: 3,
      latestReportAt: "2026-07-20T13:00:00.000Z",
    });
    const report = parseAgentReport({
      agent: "gemini",
      completed: ["Existing completion"],
      decisions: [{ decision: "Existing decision", reason: "Existing reason" }],
    });

    const merged = mergeAgentReport(original, report, {
      updatedAt: "2026-07-20T14:00:00.000Z",
      gitFacts: { branch: "main", commit: original.currentCommit, detached: false },
    });

    expect(merged.state.reportRevision).toBe(3);
    expect(merged.state.latestReportAt).toBe("2026-07-20T13:00:00.000Z");
    expect(merged.state.lastAgent).toBe("gemini");
    expect(Object.values(merged.summary).every((count) => count === 0)).toBe(true);
  });
});

describe("secret redaction", () => {
  it.each([
    ["Bearer token", "Authorization: Bearer fake_token_123456789", "fake_token_123456789"],
    ["API key", "api_key=fake-api-value-123", "fake-api-value-123"],
    ["password", "password=fake-password-123", "fake-password-123"],
    ["token assignment", "token: fake-token-value-123", "fake-token-value-123"],
    [
      "private key",
      "-----BEGIN PRIVATE KEY-----\nZmFrZS10ZXN0LWtleQ==\n-----END PRIVATE KEY-----",
      "ZmFrZS10ZXN0LWtleQ==",
    ],
    [
      "credential URL",
      "Connect to https://fake-user:fake-password@example.invalid/data",
      "fake-password",
    ],
  ])("redacts a fake %s", (_name, unsafeText, secretFragment) => {
    const report = parseAgentReport({ completed: [unsafeText] });
    const result = redactAgentReport(report);
    const serialized = JSON.stringify(result.value);

    expect(result.safe).toBe(true);
    expect(result.redactionCount).toBeGreaterThan(0);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(secretFragment);
  });

  it("leaves benign semantic text unchanged", () => {
    const report = parseAgentReport({ completed: ["Added token validation tests"] });

    expect(redactAgentReport(report)).toEqual({ value: report, redactionCount: 0, safe: true });
  });
});
