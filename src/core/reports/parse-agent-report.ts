import { agentReportSchema } from "./agent-report-schema.js";
import type { AgentReport } from "./types.js";

export const privateReasoningFields = [
  "chainOfThought",
  "chain_of_thought",
  "reasoningTrace",
  "reasoning_trace",
  "hiddenReasoning",
  "privateReasoning",
  "conversation",
  "fullTranscript",
  "messages",
] as const;

export interface AgentReportValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class AgentReportValidationError extends Error {
  constructor(readonly issues: readonly AgentReportValidationIssue[]) {
    super(
      `Invalid agent report:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`,
    );
    this.name = "AgentReportValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAgentReport(input: unknown): AgentReport {
  if (isRecord(input)) {
    const forbidden = privateReasoningFields.filter((field) => field in input);
    if (forbidden.length > 0) {
      throw new AgentReportValidationError([
        {
          path: forbidden.join(", "),
          message:
            "Private reasoning and complete conversations are not accepted; report conclusions and concise work summaries instead",
        },
      ]);
    }
  }

  const result = agentReportSchema.safeParse(input);
  if (!result.success) {
    throw new AgentReportValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
