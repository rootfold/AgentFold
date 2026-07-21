import type { z } from "zod";

import type { completedTaskSchema } from "./completed-task-schema.js";

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

export type CompletedTask = DeepReadonly<z.infer<typeof completedTaskSchema>>;

export interface CompletedTaskIdentity {
  readonly taskId: string;
  readonly finalCheckpointId: string;
  readonly finishedAt: string;
}
