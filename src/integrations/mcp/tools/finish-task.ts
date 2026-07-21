import path from "node:path";

import { commitTaskFinish, prepareTaskFinish } from "../../../core/completion/finish-task.js";
import { portablePath } from "../../../core/initialization/paths.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, mcpSuccess, type AgentFoldMcpResult } from "../mcp-response.js";
import { agentFoldMcpToolNames } from "../tool-names.js";
import { finishTaskInputSchema } from "../tool-schemas.js";
import {
  coreDependencies,
  diagnostic,
  parseToolInput,
  requireOpenSession,
  writer,
} from "./shared.js";

export async function finishTask(
  context: AgentFoldMcpApplicationContext,
  input: unknown,
): Promise<AgentFoldMcpResult> {
  const operation = agentFoldMcpToolNames.finishTask;
  const parsed = parseToolInput(operation, finishTaskInputSchema, input);
  if (!parsed.success) return parsed.result;
  const session = requireOpenSession(context, operation, parsed.data.sessionId);
  if (!session.success) return session.result;
  const { sessionId, ...completion } = parsed.data;
  const plan = await prepareTaskFinish(coreDependencies(context), {
    completion: { ...completion, agent: completion.agent ?? session.session.agent },
  });
  if (plan.status !== "ready") return mcpFailure(operation, plan.status, plan.diagnostics);
  if (
    session.session.activeTaskId !== undefined &&
    session.session.activeTaskId !== plan.task.taskId
  ) {
    return mcpFailure(operation, "task_mismatch", [
      diagnostic(
        "AFMCP017",
        "error",
        "The session is attached to a different active task.",
        "Open a new session and review the active task before finishing.",
      ),
    ]);
  }
  const committed = await commitTaskFinish(plan, context.fileSystem, writer(context));
  if (committed.status !== "success") {
    return mcpFailure(operation, committed.status, committed.diagnostics);
  }
  context.sessions.clearTask(sessionId);
  const validationSummary = {
    total: plan.task.validation.length,
    passed: plan.task.validation.filter((item) => item.status === "passed").length,
    failed: plan.task.validation.filter((item) => item.status === "failed").length,
    warning: plan.task.validation.filter((item) => item.status === "warning").length,
    notRun: plan.task.validation.filter((item) => item.status === "not_run").length,
  };
  return mcpSuccess(
    operation,
    "task_finished",
    {
      sessionId,
      taskId: plan.task.taskId,
      title: plan.task.title,
      finishedAt: plan.task.finishedAt,
      finalCheckpointId: plan.task.finalCheckpointId,
      archivePath: portablePath(path.relative(plan.repositoryRoot, plan.completedPath)),
      validationSummary,
      redactionWarningCount: plan.redactionCount,
      nextOperation: agentFoldMcpToolNames.beginTask,
    },
    [...committed.diagnostics, diagnostic("AFMCP018", "success", "Task finished through MCP.")],
  );
}
