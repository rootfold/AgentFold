import type { AgentFoldMcpApplicationContext } from "./mcp-context.js";
import type { AgentFoldMcpResult } from "./mcp-response.js";
import { beginTask } from "./tools/begin-task.js";
import { closeSession } from "./tools/close-session.js";
import { createCheckpoint } from "./tools/create-checkpoint.js";
import { getContext } from "./tools/get-context.js";
import { getResumePacket } from "./tools/get-resume-packet.js";
import { getStatus } from "./tools/get-status.js";
import { openSession } from "./tools/open-session.js";
import { reportProgress } from "./tools/report-progress.js";

export interface AgentFoldMcpToolHandlers {
  readonly getStatus: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly getContext: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly openSession: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly beginTask: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly reportProgress: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly createCheckpoint: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly getResumePacket: (input: unknown) => Promise<AgentFoldMcpResult>;
  readonly closeSession: (input: unknown) => Promise<AgentFoldMcpResult>;
}

export function createMcpToolHandlers(
  context: AgentFoldMcpApplicationContext,
): AgentFoldMcpToolHandlers {
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
