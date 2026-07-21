import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { completedTaskSchema } from "./completed-task-schema.js";
import { renderCompletedTaskBody } from "./serialize-completed-task.js";
import type { CompletedTask } from "./types.js";

const frontMatterSchema = z
  .object({
    schema: z.literal(1),
    task_id: z.string(),
    title: z.string(),
    status: z.literal("completed"),
    started_at: z.string(),
    finished_at: z.string(),
    duration_seconds: z.number(),
    objective: z.string(),
    starting_git: z.object({ branch: z.string(), commit: z.string().nullable() }).strict(),
    final_git: z.object({ branch: z.string(), commit: z.string().nullable() }).strict(),
    agents: z
      .object({
        starting: z.string().nullable(),
        last_reporting: z.string().nullable(),
        finishing: z.string(),
      })
      .strict(),
    final_checkpoint_id: z.string(),
    checkpoint_count: z.number(),
    semantic_revision: z.number(),
    summary: z.string(),
    completed: z.unknown(),
    decisions: z.unknown(),
    failed_attempts: z.unknown(),
    validation: z.unknown(),
    assumptions: z.unknown(),
    changed_paths: z.unknown(),
    diff_statistics: z.unknown(),
    follow_up: z.unknown(),
  })
  .strict();

export interface CompletedTaskParseIssue {
  readonly path: string;
  readonly message: string;
}

export class CompletedTaskParseError extends Error {
  constructor(readonly issues: readonly CompletedTaskParseIssue[]) {
    super(
      `Invalid completed task:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`,
    );
    this.name = "CompletedTaskParseError";
  }
}

function issues(error: z.ZodError): readonly CompletedTaskParseIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function fail(path: string, message: string): never {
  throw new CompletedTaskParseError([{ path, message }]);
}

export function parseCompletedTask(input: string, expectedTaskId?: string): CompletedTask {
  const source = input.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);
  if (match === null) fail("frontmatter", "Expected YAML front matter delimited by ---");
  let raw: unknown;
  try {
    raw = parseYaml(match[1] ?? "");
  } catch {
    fail("frontmatter", "Malformed YAML front matter");
  }
  const frontMatter = frontMatterSchema.safeParse(raw);
  if (!frontMatter.success) throw new CompletedTaskParseError(issues(frontMatter.error));
  const value = frontMatter.data;
  const result = completedTaskSchema.safeParse({
    schemaVersion: value.schema,
    taskId: value.task_id,
    title: value.title,
    objective: value.objective,
    status: value.status,
    startedAt: value.started_at,
    finishedAt: value.finished_at,
    durationSeconds: value.duration_seconds,
    startingBranch: value.starting_git.branch,
    startingCommit: value.starting_git.commit,
    finalBranch: value.final_git.branch,
    finalCommit: value.final_git.commit,
    startingAgent: value.agents.starting,
    lastReportingAgent: value.agents.last_reporting,
    finishingAgent: value.agents.finishing,
    summary: value.summary,
    completed: value.completed,
    decisions: value.decisions,
    failedAttempts: value.failed_attempts,
    validation: value.validation,
    assumptions: value.assumptions,
    finalCheckpointId: value.final_checkpoint_id,
    checkpointCount: value.checkpoint_count,
    semanticRevision: value.semantic_revision,
    changedPaths: value.changed_paths,
    diffStatistics: value.diff_statistics,
    followUp: value.follow_up,
  });
  if (!result.success) throw new CompletedTaskParseError(issues(result.error));
  const task = result.data;
  if (expectedTaskId !== undefined && task.taskId !== expectedTaskId) {
    fail("task_id", `Expected ${expectedTaskId} but found ${task.taskId}`);
  }
  if ((match[2] ?? "").trim() !== renderCompletedTaskBody(task)) {
    fail("body", "Completed-task body does not match the validated data");
  }
  return task;
}
