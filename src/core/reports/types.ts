import type { z } from "zod";

import type { agentReportSchema } from "./agent-report-schema.js";

export type AgentReport = z.infer<typeof agentReportSchema>;

export interface ReportMergeSummary {
  readonly completed: number;
  readonly inProgress: number;
  readonly decisions: number;
  readonly failedAttempts: number;
  readonly blockers: number;
  readonly nextActions: number;
  readonly validation: number;
  readonly assumptions: number;
}
