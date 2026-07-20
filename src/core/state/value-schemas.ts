import { z } from "zod";

import { normalizeRepositoryPath } from "../config/repository-path.js";

export function normalizedTextSchema(maximumLength: number): z.ZodType<string> {
  return z
    .string()
    .transform((value) => value.trim().replace(/\r\n?/gu, "\n").replaceAll("\n", " "))
    .pipe(z.string().min(1, "Must not be empty").max(maximumLength));
}

export const taskTitleSchema = normalizedTextSchema(200);
export const agentNameSchema = normalizedTextSchema(100);
export const semanticTextSchema = normalizedTextSchema(2_000);
export const objectiveSchema = normalizedTextSchema(4_000);
export const commandTextSchema = normalizedTextSchema(500);

export const repositoryWorkingContextSchema = z.string().transform((value, context) => {
  if (value.trim() === ".") {
    return ".";
  }

  const result = normalizeRepositoryPath(value);
  if (!result.success) {
    context.addIssue({ code: "custom", message: result.message });
    return z.NEVER;
  }

  return result.path;
});

export const decisionSchema = z
  .object({
    decision: semanticTextSchema,
    reason: semanticTextSchema,
  })
  .strict();

export const failedAttemptSchema = z
  .object({
    attempt: semanticTextSchema,
    result: semanticTextSchema,
  })
  .strict();

export const validationStatuses = ["passed", "failed", "warning", "not_run"] as const;

export const validationResultSchema = z
  .object({
    command: commandTextSchema,
    status: z.enum(validationStatuses),
    summary: semanticTextSchema,
  })
  .strict();
