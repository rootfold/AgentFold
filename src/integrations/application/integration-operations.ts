import type { AgentFoldMcpApplicationContext } from "../mcp/mcp-context.js";
import type { AgentFoldMcpResult } from "../mcp/mcp-response.js";
import { beginTask } from "../mcp/tools/begin-task.js";
import { closeSession } from "../mcp/tools/close-session.js";
import { createCheckpoint } from "../mcp/tools/create-checkpoint.js";
import { getContext } from "../mcp/tools/get-context.js";
import { getResumePacket } from "../mcp/tools/get-resume-packet.js";
import { getStatus } from "../mcp/tools/get-status.js";
import { openSession } from "../mcp/tools/open-session.js";
import { reportProgress } from "../mcp/tools/report-progress.js";

/**
 * Host-neutral application operations shared by embedded MCP and the local
 * service. The functions delegate to the validated core prepare/commit
 * boundaries; transports never call CLI commands or parse terminal output.
 */
export interface AgentFoldIntegrationOperations {
  readonly getStatus: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly getContext: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly openSession: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly beginTask: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly reportProgress: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly createCheckpoint: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly getResumePacket: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly closeSession: (input: unknown) => Promise<AgentFoldMcpResult>;
}

export function createAgentFoldIntegrationOperations(
  context: AgentFoldMcpApplicationContext,
): AgentFoldIntegrationOperations {
  return {
    getStatus: (input) => getStatus(context, input),
    getContext: (input) => getContext(context, input),
    openSession: (input) => openSession(context, input),
    beginTask: (input) => beginTask(context, input),
    reportProgress: (input) => reportProgress(context, input),
    createCheckpoint: (input) => createCheckpoint(context, input),
    getResumePacket: (input) => getResumePacket(context, input),
    closeSession: (input) => closeSession(context, input),
  };
}
