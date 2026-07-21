import { createHash } from "node:crypto";

import { z } from "zod";

import type { LaunchDescriptor } from "../connector-types.js";

export const codexMcpEntrySchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()),
    required: z.literal(true),
  })
  .strict();

export type CodexMcpEntry = z.infer<typeof codexMcpEntrySchema>;

export function createCodexMcpEntry(descriptor: LaunchDescriptor): CodexMcpEntry {
  return {
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
    required: true,
  };
}

export function fingerprintCodexMcpEntry(entry: CodexMcpEntry): string {
  return createHash("sha256").update(JSON.stringify(entry), "utf8").digest("hex");
}
