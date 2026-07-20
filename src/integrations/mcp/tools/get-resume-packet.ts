import { prepareResume } from "../../../core/resume/prepare-resume.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, mcpSuccess, type AgentFoldMcpResult } from "../mcp-response.js";
import { agentFoldMcpToolNames } from "../tool-names.js";
import { getResumePacketInputSchema } from "../tool-schemas.js";
import { diagnostic, parseToolInput, requireOpenSession } from "./shared.js";

export async function getResumePacket(
  context: AgentFoldMcpApplicationContext,
  input: unknown,
): Promise<AgentFoldMcpResult> {
  const operation = agentFoldMcpToolNames.getResumePacket;
  const parsed = parseToolInput(operation, getResumePacketInputSchema, input);
  if (!parsed.success) return parsed.result;
  const session = requireOpenSession(context, operation, parsed.data.sessionId);
  if (!session.success) return session.result;
  const plan = await prepareResume(
    {
      fileSystem: context.fileSystem,
      gitRepositoryLocator: context.gitRepositoryLocator,
      startDirectory: context.repositoryRoot,
    },
    {
      format: parsed.data.format,
      ...(parsed.data.target === undefined ? {} : { target: parsed.data.target }),
      ...(parsed.data.checkpoint === undefined ? {} : { checkpoint: parsed.data.checkpoint }),
    },
  );
  if (plan.status !== "ready") return mcpFailure(operation, plan.status, plan.diagnostics);
  context.sessions.attachTask(parsed.data.sessionId, plan.packet.task.taskId);
  return mcpSuccess(
    operation,
    "resume_packet_prepared",
    {
      sessionId: parsed.data.sessionId,
      format: plan.format,
      packet: plan.format === "json" ? plan.packet : plan.content,
      semanticFreshness: plan.packet.semanticState.freshness,
      checkpointId: plan.packet.task.checkpointId,
    },
    [...plan.diagnostics, diagnostic("AFMCP010", "success", "Resume packet prepared through MCP.")],
  );
}
