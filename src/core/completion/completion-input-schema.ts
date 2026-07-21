import { z } from "zod";

import { agentReportSchema } from "../reports/agent-report-schema.js";
import { privateReasoningFields } from "../reports/parse-agent-report.js";
import {
  agentNameSchema,
  normalizedTextSchema,
  semanticTextSchema,
} from "../state/value-schemas.js";

export const completionReportSchema = z
  .object({
    completed: agentReportSchema.shape.completed,
    inProgress: agentReportSchema.shape.inProgress,
    decisions: agentReportSchema.shape.decisions,
    failedAttempts: agentReportSchema.shape.failedAttempts,
    blockers: agentReportSchema.shape.blockers,
    nextActions: agentReportSchema.shape.nextActions,
    validation: agentReportSchema.shape.validation,
    assumptions: agentReportSchema.shape.assumptions,
  })
  .strict();

export const completionInputSchema = z
  .object({
    agent: agentNameSchema.optional(),
    summary: normalizedTextSchema(2_000),
    finalReport: completionReportSchema.optional(),
    resolvedInProgress: z.array(semanticTextSchema).max(1_000).default([]),
    resolvedBlockers: z.array(semanticTextSchema).max(1_000).default([]),
    followUp: z.array(semanticTextSchema).max(100).default([]),
  })
  .strict();

export type CompletionInput = z.infer<typeof completionInputSchema>;

export interface CompletionInputIssue {
  readonly path: string;
  readonly message: string;
}

export class CompletionInputValidationError extends Error {
  constructor(readonly issues: readonly CompletionInputIssue[]) {
    super(
      `Invalid completion input:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`,
    );
    this.name = "CompletionInputValidationError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseCompletionInput(input: unknown): CompletionInput {
  const root = record(input);
  const report = root === undefined ? undefined : record(root.finalReport);
  const forbidden = [
    ...privateReasoningFields.filter((field) => root !== undefined && field in root),
    ...privateReasoningFields
      .filter((field) => report !== undefined && field in report)
      .map((field) => `finalReport.${field}`),
  ];
  if (forbidden.length > 0) {
    throw new CompletionInputValidationError([
      {
        path: forbidden.join(", "),
        message:
          "Private reasoning and complete conversations are not accepted; provide concise engineering conclusions instead",
      },
    ]);
  }

  const parsed = completionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompletionInputValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}
