import { z } from "zod";

import { changedPathGroupsSchema, diffStatisticsSchema } from "../checkpoints/checkpoint-schema.js";
import {
  agentNameSchema,
  decisionSchema,
  failedAttemptSchema,
  normalizedTextSchema,
  objectiveSchema,
  semanticTextSchema,
  taskTitleSchema,
  validationResultSchema,
} from "../state/value-schemas.js";

const timestampSchema = z.iso.datetime({ offset: true });
const commitSchema = z
  .string()
  .regex(/^[0-9a-f]{7,64}$/iu, "Must be a Git commit ID")
  .nullable();
const branchSchema = z.string().trim().min(1).max(500);

export const completedTaskSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskId: z.string().regex(/^AF-\d{8}-\d{3}$/u),
    title: taskTitleSchema,
    objective: objectiveSchema,
    status: z.literal("completed"),
    startedAt: timestampSchema,
    finishedAt: timestampSchema,
    durationSeconds: z.number().int().nonnegative(),
    startingBranch: branchSchema,
    startingCommit: commitSchema,
    finalBranch: branchSchema,
    finalCommit: commitSchema,
    startingAgent: agentNameSchema.nullable(),
    lastReportingAgent: agentNameSchema.nullable(),
    finishingAgent: agentNameSchema,
    summary: normalizedTextSchema(2_000),
    completed: z.array(semanticTextSchema).max(1_000),
    decisions: z.array(decisionSchema).max(1_000),
    failedAttempts: z.array(failedAttemptSchema).max(1_000),
    validation: z.array(validationResultSchema).max(1_000),
    assumptions: z.array(semanticTextSchema).max(1_000),
    finalCheckpointId: z.string().regex(/^CP-\d{3}$/u),
    checkpointCount: z.number().int().positive(),
    semanticRevision: z.number().int().nonnegative(),
    changedPaths: changedPathGroupsSchema,
    diffStatistics: diffStatisticsSchema,
    followUp: z.array(semanticTextSchema).max(100),
  })
  .strict()
  .superRefine((task, context) => {
    const started = Date.parse(task.startedAt);
    const finished = Date.parse(task.finishedAt);
    if (finished < started) {
      context.addIssue({
        code: "custom",
        path: ["finishedAt"],
        message: "Finished timestamp cannot precede task start",
      });
    }
    if (task.durationSeconds !== Math.floor(Math.max(0, finished - started) / 1_000)) {
      context.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "Duration must match the deterministic timestamp difference",
      });
    }
  });
