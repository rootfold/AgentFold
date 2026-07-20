import type { z } from "zod";

import type { Diagnostic } from "../../../core/diagnostics/diagnostic.js";
import { AtomicTextFileWriter } from "../../../core/filesystem/atomic-text-file-writer.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, type AgentFoldMcpResult } from "../mcp-response.js";
import type { AgentFoldMcpSession } from "../session-registry.js";

export type ParsedToolInput<Output> =
  | { readonly success: true; readonly data: Output }
  | { readonly success: false; readonly result: AgentFoldMcpResult };

export function parseToolInput<Schema extends z.ZodType>(
  operation: string,
  schema: Schema,
  input: unknown,
): ParsedToolInput<z.output<Schema>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  return {
    success: false,
    result: mcpFailure(operation, "invalid_input", [
      {
        code: "AFMCP013",
        severity: "error",
        message: "The MCP tool input did not match the required schema.",
        suggestion: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
          .join("; "),
      },
    ]),
  };
}

export type OpenSessionResult =
  | { readonly success: true; readonly session: AgentFoldMcpSession }
  | { readonly success: false; readonly result: AgentFoldMcpResult };

export function requireOpenSession(
  context: AgentFoldMcpApplicationContext,
  operation: string,
  sessionId: string,
): OpenSessionResult {
  const lookup = context.sessions.requireOpen(sessionId);
  if (lookup.status === "open") return { success: true, session: lookup.session };
  const closed = lookup.status === "closed";
  return {
    success: false,
    result: mcpFailure(operation, closed ? "closed_session" : "unknown_session", [
      {
        code: closed ? "AFMCP005" : "AFMCP004",
        severity: "error",
        message: closed ? "The MCP session is already closed." : "The MCP session is unknown.",
        suggestion: "Call agentfold_open_session and use the returned session ID.",
      },
    ]),
  };
}

export function coreDependencies(context: AgentFoldMcpApplicationContext) {
  return {
    fileSystem: context.fileSystem,
    gitRepositoryLocator: context.gitRepositoryLocator,
    gitInspector: context.gitInspector,
    now: context.now,
    startDirectory: context.repositoryRoot,
  };
}

export function writer(context: AgentFoldMcpApplicationContext): AtomicTextFileWriter {
  return new AtomicTextFileWriter(context.fileSystem);
}

export function diagnostic(
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  suggestion?: string,
): Diagnostic {
  return { code, severity, message, ...(suggestion === undefined ? {} : { suggestion }) };
}

export function configuredContextFailure(
  operation: string,
  status: string,
  diagnostics: readonly Diagnostic[],
): AgentFoldMcpResult {
  return mcpFailure(operation, status, diagnostics);
}
