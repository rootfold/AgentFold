import { z } from "zod";

import {
  checkpointGitFactsSchema,
  checkpointReportedStateSchema,
} from "../checkpoints/checkpoint-schema.js";
import { agentNameSchema, taskTitleSchema } from "../state/value-schemas.js";

export const resumeTargets = ["codex", "antigravity", "claude", "gemini", "generic"] as const;
export const resumeTargetSchema = z.enum(resumeTargets);
export const resumeFormats = ["markdown", "json"] as const;
export const resumeFormatSchema = z.enum(resumeFormats);

const timestampSchema = z.iso.datetime({ offset: true });
const checkpointIdSchema = z.string().regex(/^CP-\d{3}$/u);
const taskIdSchema = z.string().regex(/^AF-\d{8}-\d{3}$/u);

const targetSchema = z
  .object({
    id: resumeTargetSchema,
    displayName: z.string().min(1).max(100),
    openingInstruction: z.string().min(1).max(500),
    nativeInstructionFile: z.enum(["AGENTS.md", "CLAUDE.md", "GEMINI.md"]).optional(),
  })
  .strict();

const commandsSchema = z
  .object({
    install: z.string().min(1).optional(),
    dev: z.string().min(1).optional(),
    build: z.string().min(1).optional(),
    test: z.string().min(1).optional(),
    lint: z.string().min(1).optional(),
    typecheck: z.string().min(1).optional(),
  })
  .strict();

const omittedPathCountsSchema = z
  .object({
    added: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    renamed: z.number().int().nonnegative(),
    copied: z.number().int().nonnegative(),
    untracked: z.number().int().nonnegative(),
    unmerged: z.number().int().nonnegative(),
  })
  .strict();

const omittedSemanticCountsSchema = z
  .object({
    completed: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    decisions: z.number().int().nonnegative(),
    failedAttempts: z.number().int().nonnegative(),
    blockers: z.number().int().nonnegative(),
    nextActions: z.number().int().nonnegative(),
    validation: z.number().int().nonnegative(),
    assumptions: z.number().int().nonnegative(),
  })
  .strict();

export const resumePacketSchema = z
  .object({
    schemaVersion: z.literal(1),
    project: z
      .object({
        name: z.string().trim().min(1).max(100),
        summary: z.string().max(1_000),
      })
      .strict(),
    task: z
      .object({
        taskId: taskIdSchema,
        checkpointId: checkpointIdSchema,
        checkpointCreatedAt: timestampSchema,
        isLatestCheckpoint: z.boolean(),
        title: taskTitleSchema,
        objective: z.string().trim().min(1).max(4_000),
        status: z.literal("active"),
      })
      .strict(),
    target: targetSchema.optional(),
    observedGitState: checkpointGitFactsSchema,
    semanticState: checkpointReportedStateSchema
      .extend({
        revision: z.number().int().nonnegative(),
        freshness: z.enum(["none", "new", "reused"]),
        lastReportingAgent: agentNameSchema.optional(),
        checkpointAgent: agentNameSchema.optional(),
      })
      .strict(),
    projectCommands: commandsSchema,
    safety: z
      .object({
        instructions: z.array(z.string().trim().min(1).max(2_000)),
        excludedPaths: z.array(z.string().trim().min(1).max(1_000)),
      })
      .strict(),
    omitted: z
      .object({
        projectSummaryCharacters: z.number().int().nonnegative(),
        safetyInstructions: z.number().int().nonnegative(),
        excludedPaths: z.number().int().nonnegative(),
        projectCommands: z.number().int().nonnegative(),
        changedPaths: omittedPathCountsSchema,
        recentCommits: z.number().int().nonnegative(),
        semantic: omittedSemanticCountsSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((packet, context) => {
    const semantic = packet.semanticState;
    if (semantic.revision === 0 && semantic.freshness !== "none") {
      context.addIssue({
        code: "custom",
        path: ["semanticState", "freshness"],
        message: "Semantic revision zero must be marked absent",
      });
    }
    if (semantic.revision > 0 && semantic.freshness === "none") {
      context.addIssue({
        code: "custom",
        path: ["semanticState", "freshness"],
        message: "Reported semantic state cannot be marked absent",
      });
    }
    if (
      semantic.freshness === "none" &&
      [
        semantic.completed,
        semantic.inProgress,
        semantic.decisions,
        semantic.failedAttempts,
        semantic.blockers,
        semantic.nextActions,
        semantic.validation,
        semantic.assumptions,
      ].some((entries) => entries.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["semanticState"],
        message: "Absent semantic state cannot contain reported conclusions",
      });
    }
  });
