import { z } from "zod";

import {
  agentNameSchema,
  decisionSchema,
  failedAttemptSchema,
  semanticTextSchema,
  validationResultSchema,
} from "../state/value-schemas.js";

const reportArray = z.array(semanticTextSchema).max(100);

export const agentReportSchema = z
  .object({
    agent: agentNameSchema.optional(),
    completed: reportArray.default([]),
    inProgress: reportArray.default([]),
    decisions: z.array(decisionSchema).max(100).default([]),
    failedAttempts: z.array(failedAttemptSchema).max(100).default([]),
    blockers: reportArray.default([]),
    nextActions: reportArray.default([]),
    validation: z.array(validationResultSchema).max(100).default([]),
    assumptions: reportArray.default([]),
  })
  .strict()
  .superRefine((report, context) => {
    const usefulItemCount =
      report.completed.length +
      report.inProgress.length +
      report.decisions.length +
      report.failedAttempts.length +
      report.blockers.length +
      report.nextActions.length +
      report.validation.length +
      report.assumptions.length;

    if (usefulItemCount === 0) {
      context.addIssue({
        code: "custom",
        message: "Report must contain at least one semantic progress item",
      });
    }
  });
