import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { Diagnostic } from "../../core/diagnostics/diagnostic.js";

export type AgentFoldMcpResult<T = unknown> = {
  readonly ok: boolean;
  readonly operation: string;
  readonly status: string;
  readonly data?: T;
  readonly diagnostics: readonly Diagnostic[];
};

export const mcpDiagnosticSchema = z
  .object({
    code: z.string(),
    severity: z.enum(["info", "success", "warning", "error"]),
    message: z.string(),
    suggestion: z.string().optional(),
  })
  .strict();

export const mcpResultSchema = z
  .object({
    ok: z.boolean(),
    operation: z.string(),
    status: z.string(),
    data: z.unknown().optional(),
    diagnostics: z.array(mcpDiagnosticSchema),
  })
  .strict();

export function mcpSuccess<T>(
  operation: string,
  status: string,
  data: T,
  diagnostics: readonly Diagnostic[] = [],
): AgentFoldMcpResult<T> {
  return { ok: true, operation, status, data, diagnostics };
}

export function mcpFailure(
  operation: string,
  status: string,
  diagnostics: readonly Diagnostic[],
  data?: unknown,
): AgentFoldMcpResult {
  return {
    ok: false,
    operation,
    status,
    ...(data === undefined ? {} : { data }),
    diagnostics,
  };
}

export function toCallToolResult(result: AgentFoldMcpResult): CallToolResult {
  const structuredContent = { ...result };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    ...(result.ok ? {} : { isError: true }),
  };
}
