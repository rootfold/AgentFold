import type { z } from "zod";

import type {
  resumeFormatSchema,
  resumePacketSchema,
  resumeTargetSchema,
} from "./resume-packet-schema.js";

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

export type ResumePacket = DeepReadonly<z.infer<typeof resumePacketSchema>>;
export type ResumeTarget = z.infer<typeof resumeTargetSchema>;
export type ResumeFormat = z.infer<typeof resumeFormatSchema>;

export interface ResumePacketTruncationResult {
  readonly packet: ResumePacket;
  readonly truncated: boolean;
  readonly reducedCategories: readonly string[];
}
