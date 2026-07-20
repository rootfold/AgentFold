import type { z } from "zod";

import type { activeTaskSchema, checkpointHistoryMetadataSchema } from "./active-state-schema.js";
import type {
  decisionSchema,
  failedAttemptSchema,
  validationResultSchema,
} from "./value-schemas.js";

export type Decision = z.infer<typeof decisionSchema>;
export type FailedAttempt = z.infer<typeof failedAttemptSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type CheckpointHistoryMetadata = z.infer<typeof checkpointHistoryMetadataSchema>;
export type ActiveTask = z.infer<typeof activeTaskSchema>;
