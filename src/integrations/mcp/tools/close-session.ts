import { containsSecretLikeText } from "../../../core/reports/redact-secrets.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, mcpSuccess, type AgentFoldMcpResult } from "../mcp-response.js";
import { agentFoldMcpToolNames } from "../tool-names.js";
import { closeSessionInputSchema } from "../tool-schemas.js";
import { createCheckpoint } from "./create-checkpoint.js";
import { getResumePacket } from "./get-resume-packet.js";
import { diagnostic, parseToolInput, requireOpenSession } from "./shared.js";
import { reportProgress } from "./report-progress.js";

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

export async function closeSession(
  context: AgentFoldMcpApplicationContext,
  input: unknown,
): Promise<AgentFoldMcpResult> {
  const operation = agentFoldMcpToolNames.closeSession;
  const parsed = parseToolInput(operation, closeSessionInputSchema, input);
  if (!parsed.success) return parsed.result;
  if (parsed.data.agent !== undefined && containsSecretLikeText(parsed.data.agent)) {
    return mcpFailure(operation, "unsafe_identity", [
      diagnostic("AFMCP014", "error", "Secret-like content is not accepted in agent labels."),
    ]);
  }
  const session = requireOpenSession(context, operation, parsed.data.sessionId);
  if (!session.success) return session.result;

  if (session.session.activeTaskId === undefined) {
    const closed = context.sessions.close(parsed.data.sessionId);
    if (closed === undefined) {
      return mcpFailure(operation, "closed_session", [
        diagnostic("AFMCP005", "error", "The MCP session could not be marked closed."),
      ]);
    }
    return mcpSuccess(
      operation,
      "session_closed",
      {
        sessionId: closed.sessionId,
        taskId: null,
        reportRevision: null,
        reportStatus: "not_submitted",
        checkpointStatus: "not_requested",
        checkpointId: null,
        duplicateCheckpoint: false,
        resumePacket: null,
        closedAt: closed.closedAt,
      },
      [
        diagnostic(
          "AFMCP019",
          "info",
          "The session had no active task; no report or checkpoint was created.",
        ),
        diagnostic("AFMCP011", "success", "MCP session closed."),
      ],
    );
  }

  let reportResult: AgentFoldMcpResult | undefined;
  if (parsed.data.finalReport !== undefined) {
    reportResult = await reportProgress(context, {
      sessionId: parsed.data.sessionId,
      agent: parsed.data.agent ?? session.session.agent,
      ...parsed.data.finalReport,
    });
    if (!reportResult.ok) return mcpFailure(operation, "report_failed", reportResult.diagnostics);
  }

  let checkpointResult: AgentFoldMcpResult | undefined;
  if (parsed.data.createCheckpoint) {
    checkpointResult = await createCheckpoint(context, {
      sessionId: parsed.data.sessionId,
      agent: parsed.data.agent ?? session.session.agent,
      dryRun: false,
    });
    if (!checkpointResult.ok) {
      if (reportResult?.ok === true) {
        return mcpFailure(
          operation,
          "partial_success",
          [
            ...reportResult.diagnostics,
            ...checkpointResult.diagnostics,
            diagnostic(
              "AFMCP012",
              "warning",
              "Semantic progress was saved, but checkpoint creation failed; the session remains open.",
            ),
          ],
          { sessionId: parsed.data.sessionId, report: reportResult.data, checkpoint: null },
        );
      }
      return mcpFailure(operation, "checkpoint_failed", checkpointResult.diagnostics);
    }
  }

  let resumeResult: AgentFoldMcpResult | undefined;
  if (parsed.data.returnResumePacket) {
    resumeResult = await getResumePacket(context, {
      sessionId: parsed.data.sessionId,
      target: parsed.data.resumeTarget,
      format: "json",
    });
    if (!resumeResult.ok) {
      const durableChange = reportResult?.ok === true || checkpointResult?.ok === true;
      return mcpFailure(operation, durableChange ? "partial_success" : "resume_failed", [
        ...(reportResult?.diagnostics ?? []),
        ...(checkpointResult?.diagnostics ?? []),
        ...resumeResult.diagnostics,
        ...(durableChange
          ? [
              diagnostic(
                "AFMCP012",
                "warning",
                "Durable progress was saved, but the requested resume packet failed; the session remains open.",
              ),
            ]
          : []),
      ]);
    }
  }

  const closed = context.sessions.close(parsed.data.sessionId);
  if (closed === undefined) {
    return mcpFailure(operation, "closed_session", [
      diagnostic("AFMCP005", "error", "The MCP session could not be marked closed."),
    ]);
  }
  const reportData = asRecord(reportResult?.data);
  const checkpointData = asRecord(checkpointResult?.data);
  return mcpSuccess(
    operation,
    "session_closed",
    {
      sessionId: closed.sessionId,
      taskId: checkpointData.taskId ?? reportData.taskId ?? closed.activeTaskId ?? null,
      reportRevision: reportData.newReportRevision ?? null,
      reportStatus: reportResult?.status ?? "not_submitted",
      checkpointStatus: checkpointResult?.status ?? "not_requested",
      checkpointId: checkpointData.checkpointId ?? null,
      duplicateCheckpoint: checkpointData.duplicate ?? false,
      resumePacket: asRecord(resumeResult?.data).packet ?? null,
      closedAt: closed.closedAt,
    },
    [
      ...(reportResult?.diagnostics ?? []),
      ...(checkpointResult?.diagnostics ?? []),
      ...(resumeResult?.diagnostics ?? []),
      ...(parsed.data.finalReport === undefined
        ? [
            diagnostic(
              "AFMCP016",
              "warning",
              "No final semantic report was submitted during session close.",
            ),
          ]
        : []),
      diagnostic("AFMCP011", "success", "MCP session closed."),
    ],
  );
}
