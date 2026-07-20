import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { containsSecretLikeText } from "../../core/reports/redact-secrets.js";
import type { AgentFoldMcpApplicationContext } from "./mcp-context.js";
import {
  safeDebugMessage,
  safeUnexpectedDiagnostic,
  sanitizeMcpDiagnostics,
} from "./mcp-diagnostics.js";
import { createMcpToolHandlers } from "./mcp-tools.js";
import {
  mcpFailure,
  mcpResultSchema,
  toCallToolResult,
  type AgentFoldMcpResult,
} from "./mcp-response.js";
import { agentFoldMcpToolNames } from "./tool-names.js";
import {
  beginTaskInputSchema,
  closeSessionInputSchema,
  createCheckpointInputSchema,
  getContextInputSchema,
  getResumePacketInputSchema,
  getStatusInputSchema,
  openSessionInputSchema,
  reportProgressInputSchema,
} from "./tool-schemas.js";

export const agentFoldMcpInstructions = [
  "Call agentfold_open_session before repository work.",
  "Continue an active task only when its continuation packet matches the user's request.",
  "Call agentfold_begin_task only for clearly requested new work when no active task exists.",
  "Report meaningful progress, then call agentfold_close_session before ending or switching agents.",
  "Reports contain concise engineering conclusions, never private chain of thought, secrets, or conversations.",
  "Never discard uncommitted work, create commits, or push unless the user separately requests it.",
].join(" ");

export interface CreateAgentFoldMcpServerInput {
  readonly context: AgentFoldMcpApplicationContext;
  readonly handlers?: ReturnType<typeof createMcpToolHandlers>;
}

function sanitizeValue(value: unknown, repositoryRoot: string): unknown {
  if (typeof value === "string") {
    return value
      .replaceAll(repositoryRoot, ".")
      .replaceAll(repositoryRoot.replaceAll("\\", "/"), ".");
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, repositoryRoot));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, repositoryRoot)]),
    );
  }
  return value;
}

function safeResult(
  context: AgentFoldMcpApplicationContext,
  result: AgentFoldMcpResult,
): AgentFoldMcpResult {
  const sanitized: AgentFoldMcpResult = {
    ...result,
    ...(result.data === undefined
      ? {}
      : { data: sanitizeValue(result.data, context.repositoryRoot) }),
    diagnostics: sanitizeMcpDiagnostics(result.diagnostics, context.repositoryRoot),
  };
  if (containsSecretLikeText(JSON.stringify(sanitized))) {
    return mcpFailure(result.operation, "unsafe_output", [
      {
        code: "AFMCP014",
        severity: "error",
        message: "A secret-like value was withheld from the MCP response.",
      },
    ]);
  }
  return sanitized;
}

export function createAgentFoldMcpServer(input: CreateAgentFoldMcpServerInput): McpServer {
  const { context } = input;
  const handlers = input.handlers ?? createMcpToolHandlers(context);
  const server = new McpServer(
    { name: "agentfold", version: context.version },
    { instructions: agentFoldMcpInstructions },
  );
  const invoke = async (
    handler: (value: unknown) => Promise<AgentFoldMcpResult>,
    value: unknown,
  ) => {
    try {
      return toCallToolResult(safeResult(context, await handler(value)));
    } catch (error: unknown) {
      context.logger.debug(`Tool failure: ${safeDebugMessage(error, context.repositoryRoot)}`);
      return toCallToolResult(
        mcpFailure("agentfold_mcp", "unexpected_failure", [safeUnexpectedDiagnostic()]),
      );
    }
  };
  const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;
  const stateAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  } as const;

  server.registerTool(
    agentFoldMcpToolNames.getStatus,
    {
      title: "Get AgentFold status",
      description: "Read initialization, active task, checkpoint, and next-operation status.",
      inputSchema: getStatusInputSchema,
      outputSchema: mcpResultSchema,
      annotations: readOnlyAnnotations,
    },
    (value) => invoke(handlers.getStatus, value),
  );
  server.registerTool(
    agentFoldMcpToolNames.getContext,
    {
      title: "Get AgentFold context",
      description: "Read bounded canonical project context without source files.",
      inputSchema: getContextInputSchema,
      outputSchema: mcpResultSchema,
      annotations: readOnlyAnnotations,
    },
    (value) => invoke(handlers.getContext, value),
  );
  server.registerTool(
    agentFoldMcpToolNames.openSession,
    {
      title: "Open AgentFold session",
      description: "Open an in-memory session and obtain task or continuation status.",
      inputSchema: openSessionInputSchema,
      outputSchema: mcpResultSchema,
      annotations: { ...readOnlyAnnotations, idempotentHint: false },
    },
    (value) => invoke(handlers.openSession, value),
  );
  server.registerTool(
    agentFoldMcpToolNames.beginTask,
    {
      title: "Begin AgentFold task",
      description: "Create validated active task state for an open MCP session.",
      inputSchema: beginTaskInputSchema,
      outputSchema: mcpResultSchema,
      annotations: stateAnnotations,
    },
    (value) => invoke(handlers.beginTask, value),
  );
  server.registerTool(
    agentFoldMcpToolNames.reportProgress,
    {
      title: "Report AgentFold progress",
      description: "Merge validated semantic engineering progress into active task state.",
      inputSchema: reportProgressInputSchema,
      outputSchema: mcpResultSchema,
      annotations: stateAnnotations,
    },
    (value) => invoke(handlers.reportProgress, value),
  );
  server.registerTool(
    agentFoldMcpToolNames.createCheckpoint,
    {
      title: "Create AgentFold checkpoint",
      description: "Capture bounded Git facts and semantic state in immutable history.",
      inputSchema: createCheckpointInputSchema,
      outputSchema: mcpResultSchema,
      annotations: stateAnnotations,
    },
    (value) => invoke(handlers.createCheckpoint, value),
  );
  server.registerTool(
    agentFoldMcpToolNames.getResumePacket,
    {
      title: "Get AgentFold resume packet",
      description: "Read a bounded continuation packet from immutable checkpoint history.",
      inputSchema: getResumePacketInputSchema,
      outputSchema: mcpResultSchema,
      annotations: readOnlyAnnotations,
    },
    (value) => invoke(handlers.getResumePacket, value),
  );
  server.registerTool(
    agentFoldMcpToolNames.closeSession,
    {
      title: "Close AgentFold session",
      description: "Optionally report, checkpoint, resume, then close the in-memory session.",
      inputSchema: closeSessionInputSchema,
      outputSchema: mcpResultSchema,
      annotations: stateAnnotations,
    },
    (value) => invoke(handlers.closeSession, value),
  );

  return server;
}
