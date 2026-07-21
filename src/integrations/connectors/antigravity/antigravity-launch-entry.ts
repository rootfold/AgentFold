import { z } from "zod";

import type { LaunchDescriptor } from "../connector-types.js";
import { fingerprintJsonValue } from "./antigravity-config.js";

export const antigravityMcpEntrySchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()),
  })
  .strict();

export type AntigravityMcpEntry = z.infer<typeof antigravityMcpEntrySchema>;

export function createAntigravityMcpEntry(descriptor: LaunchDescriptor): AntigravityMcpEntry {
  return antigravityMcpEntrySchema.parse({
    command: descriptor.command,
    args: [
      ...descriptor.argsPrefix,
      "mcp",
      "--service",
      "required",
      "--ensure-service",
      "--workspace-mode",
      "auto",
    ],
  });
}

export function fingerprintAntigravityMcpEntry(entry: unknown): string {
  return fingerprintJsonValue(entry);
}
