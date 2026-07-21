import { z } from "zod";

import { completionInputSchema } from "../../core/completion/completion-input-schema.js";
import { agentReportSchema } from "../../core/reports/agent-report-schema.js";
import { resumeFormatSchema, resumeTargetSchema } from "../../core/resume/resume-packet-schema.js";
import {
  agentNameSchema,
  objectiveSchema,
  taskTitleSchema,
} from "../../core/state/value-schemas.js";

const sessionIdSchema = z.string().trim().min(1).max(200);
const clientNameSchema = z.string().trim().min(1).max(100);

export const getStatusInputSchema = z.object({}).strict();

export const getContextInputSchema = z
  .object({ includeContextDocuments: z.boolean().default(false) })
  .strict();

export const openSessionInputSchema = z
  .object({
    client: clientNameSchema,
    agent: agentNameSchema,
    target: resumeTargetSchema.default("generic"),
    resumeFormat: resumeFormatSchema.default("json"),
  })
  .strict();

export const beginTaskInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    title: taskTitleSchema,
    objective: objectiveSchema.optional(),
    agent: agentNameSchema.optional(),
  })
  .strict();

export const reportProgressInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    ...agentReportSchema.shape,
  })
  .strict();

export const createCheckpointInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    agent: agentNameSchema.optional(),
    dryRun: z.boolean().default(false),
  })
  .strict();

export const finishTaskInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    agent: completionInputSchema.shape.agent,
    summary: completionInputSchema.shape.summary,
    finalReport: completionInputSchema.shape.finalReport,
    resolvedInProgress: completionInputSchema.shape.resolvedInProgress,
    resolvedBlockers: completionInputSchema.shape.resolvedBlockers,
    followUp: completionInputSchema.shape.followUp,
  })
  .strict();

export const getResumePacketInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    target: resumeTargetSchema.optional(),
    format: resumeFormatSchema.default("json"),
    checkpoint: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const finalReportSchema = z
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

export const closeSessionInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    agent: agentNameSchema.optional(),
    finalReport: finalReportSchema.optional(),
    createCheckpoint: z.boolean().default(true),
    returnResumePacket: z.boolean().default(false),
    resumeTarget: resumeTargetSchema.default("generic"),
  })
  .strict();

export type GetStatusInput = z.infer<typeof getStatusInputSchema>;
export type GetContextInput = z.infer<typeof getContextInputSchema>;
export type OpenSessionInput = z.infer<typeof openSessionInputSchema>;
export type BeginTaskInput = z.infer<typeof beginTaskInputSchema>;
export type ReportProgressInput = z.infer<typeof reportProgressInputSchema>;
export type CreateCheckpointInput = z.infer<typeof createCheckpointInputSchema>;
export type FinishTaskInput = z.infer<typeof finishTaskInputSchema>;
export type GetResumePacketInput = z.infer<typeof getResumePacketInputSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionInputSchema>;
