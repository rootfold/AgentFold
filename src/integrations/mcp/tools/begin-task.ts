import { commitTaskStart, prepareTaskStart } from "../../../core/state/start-task.js";
import { containsSecretLikeText } from "../../../core/reports/redact-secrets.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, mcpSuccess, type AgentFoldMcpResult } from "../mcp-response.js";
import { agentFoldMcpToolNames } from "../tool-names.js";
import { beginTaskInputSchema } from "../tool-schemas.js";
import {
  coreDependencies,
  diagnostic,
  parseToolInput,
  requireOpenSession,
  writer,
} from "./shared.js";

export async function beginTask(
  context: AgentFoldMcpApplicationContext,
  input: unknown,
): Promise<AgentFoldMcpResult> {
  const operation = agentFoldMcpToolNames.beginTask;
  const parsed = parseToolInput(operation, beginTaskInputSchema, input);
  if (!parsed.success) return parsed.result;
  const session = requireOpenSession(context, operation, parsed.data.sessionId);
  if (!session.success) return session.result;
  const objective = parsed.data.objective ?? parsed.data.title;
  if (
    containsSecretLikeText(parsed.data.title) ||
    containsSecretLikeText(objective) ||
    (parsed.data.agent !== undefined && containsSecretLikeText(parsed.data.agent))
  ) {
    return mcpFailure(operation, "unsafe_objective", [
      diagnostic(
        "AFMCP014",
        "error",
        "Secret-like content is not accepted in task or agent identity fields.",
        "Remove sensitive values and submit concise engineering metadata.",
      ),
    ]);
  }
  const plan = await prepareTaskStart(coreDependencies(context), {
    title: parsed.data.title,
    objective,
    agent: parsed.data.agent ?? session.session.agent,
  });
  if (plan.status !== "ready") return mcpFailure(operation, plan.status, plan.diagnostics);
  try {
    const diagnostics = await commitTaskStart(plan, writer(context));
    context.sessions.attachTask(parsed.data.sessionId, plan.state.taskId);
    return mcpSuccess(
      operation,
      "task_started",
      {
        sessionId: parsed.data.sessionId,
        taskId: plan.state.taskId,
        title: plan.state.title,
        objective: plan.state.objective,
        startingBranch: plan.state.startingBranch,
        startingCommit: plan.state.startingCommit,
      },
      [...diagnostics, diagnostic("AFMCP006", "success", "Task started through MCP.")],
    );
  } catch {
    return mcpFailure(operation, "write_failure", [
      diagnostic(
        "AFMCP014",
        "error",
        "The active task could not be created atomically.",
        "No existing active task was overwritten.",
      ),
    ]);
  }
}
