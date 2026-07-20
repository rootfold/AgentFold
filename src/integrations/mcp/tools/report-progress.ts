import { commitAgentReport, prepareAgentReport } from "../../../core/reports/apply-report.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, mcpSuccess, type AgentFoldMcpResult } from "../mcp-response.js";
import { agentFoldMcpToolNames } from "../tool-names.js";
import { reportProgressInputSchema } from "../tool-schemas.js";
import {
  coreDependencies,
  diagnostic,
  parseToolInput,
  requireOpenSession,
  writer,
} from "./shared.js";

export async function reportProgress(
  context: AgentFoldMcpApplicationContext,
  input: unknown,
): Promise<AgentFoldMcpResult> {
  const operation = agentFoldMcpToolNames.reportProgress;
  const parsed = parseToolInput(operation, reportProgressInputSchema, input);
  if (!parsed.success) return parsed.result;
  const session = requireOpenSession(context, operation, parsed.data.sessionId);
  if (!session.success) return session.result;
  const { sessionId, ...report } = parsed.data;
  const explicitAgent = report.agent;
  const plan = await prepareAgentReport(coreDependencies(context), {
    json: JSON.stringify({ ...report, agent: explicitAgent ?? session.session.agent }),
  });
  if (plan.status !== "ready") return mcpFailure(operation, plan.status, plan.diagnostics);
  try {
    const diagnostics = await commitAgentReport(plan, writer(context));
    context.sessions.attachTask(sessionId, plan.taskId);
    return mcpSuccess(
      operation,
      plan.changed ? "report_applied" : "duplicate_report",
      {
        sessionId,
        taskId: plan.taskId,
        previousReportRevision: plan.previousRevision,
        newReportRevision: plan.newRevision,
        changed: plan.changed,
        added: plan.summary,
        redactionWarningCount: plan.redactionCount,
      },
      [...diagnostics, diagnostic("AFMCP007", "success", "Semantic report processed through MCP.")],
    );
  } catch {
    return mcpFailure(operation, "write_failure", [
      diagnostic("AFMCP014", "error", "The semantic report could not be persisted atomically."),
    ]);
  }
}
