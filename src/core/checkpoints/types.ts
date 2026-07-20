import type { z } from "zod";

import type {
  checkpointGitFactsSchema,
  checkpointReportedStateSchema,
  checkpointSchema,
} from "./checkpoint-schema.js";

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

export type CheckpointGitFacts = DeepReadonly<z.infer<typeof checkpointGitFactsSchema>>;
export type CheckpointReportedState = DeepReadonly<z.infer<typeof checkpointReportedStateSchema>>;
export type Checkpoint = DeepReadonly<z.infer<typeof checkpointSchema>>;
