import { loadCanonicalContext } from "../../../core/context/load-context.js";
import { containsSecretLikeText } from "../../../core/reports/redact-secrets.js";
import { prepareResume } from "../../../core/resume/prepare-resume.js";
import { loadActiveState } from "../../../core/state/load-active-state.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, mcpSuccess, type AgentFoldMcpResult } from "../mcp-response.js";
import { agentFoldMcpToolNames } from "../tool-names.js";
import { openSessionInputSchema } from "../tool-schemas.js";
import { diagnostic, parseToolInput } from "./shared.js";

export async function openSession(
  context: AgentFoldMcpApplicationContext,
  input: unknown,
): Promise<AgentFoldMcpResult> {
  const operation = agentFoldMcpToolNames.openSession;
  const parsed = parseToolInput(operation, openSessionInputSchema, input);
  if (!parsed.success) return parsed.result;
  if (containsSecretLikeText(parsed.data.client) || containsSecretLikeText(parsed.data.agent)) {
    return mcpFailure(operation, "unsafe_identity", [
      diagnostic(
        "AFMCP014",
        "error",
        "Secret-like content is not accepted in MCP client or agent labels.",
      ),
    ]);
  }
  const session = context.sessions.open(parsed.data.client, parsed.data.agent);
  const opened = diagnostic("AFMCP003", "success", "MCP session opened.");
  const canonical = await loadCanonicalContext({
    fileSystem: context.fileSystem,
    gitRepositoryLocator: context.gitRepositoryLocator,
    startDirectory: context.repositoryRoot,
  });
  if (canonical.status === "error") {
    const uninitialized = canonical.diagnostics.some((item) => item.code === "AFC002");
    return uninitialized
      ? mcpSuccess(
          operation,
          "uninitialized",
          { sessionId: session.sessionId, nextOperation: "initialize_with_cli" },
          [
            opened,
            ...canonical.diagnostics.map((item) => ({ ...item, severity: "warning" as const })),
          ],
        )
      : mcpFailure(operation, "invalid_context", [opened, ...canonical.diagnostics], {
          sessionId: session.sessionId,
        });
  }
  const active = await loadActiveState(context.fileSystem, context.repositoryRoot);
  if (active.status === "error") {
    return mcpFailure(operation, "invalid_state", [opened, ...active.diagnostics], {
      sessionId: session.sessionId,
    });
  }
  if (active.status === "missing") {
    return mcpSuccess(
      operation,
      "no_active_task",
      {
        sessionId: session.sessionId,
        project: canonical.context.project,
        nextOperation: agentFoldMcpToolNames.beginTask,
      },
      [opened, ...canonical.diagnostics],
    );
  }

  context.sessions.attachTask(session.sessionId, active.state.taskId);
  if (active.state.checkpointHistory.latestCheckpointId === null) {
    return mcpSuccess(
      operation,
      "active_without_checkpoint",
      {
        sessionId: session.sessionId,
        task: { taskId: active.state.taskId, title: active.state.title },
        latestCheckpointId: null,
        nextOperation: agentFoldMcpToolNames.createCheckpoint,
      },
      [opened, ...canonical.diagnostics],
    );
  }

  const resume = await prepareResume(
    {
      fileSystem: context.fileSystem,
      gitRepositoryLocator: context.gitRepositoryLocator,
      startDirectory: context.repositoryRoot,
    },
    { target: parsed.data.target, format: parsed.data.resumeFormat },
  );
  if (resume.status !== "ready") {
    return mcpFailure(operation, resume.status, [opened, ...resume.diagnostics], {
      sessionId: session.sessionId,
      task: { taskId: active.state.taskId, title: active.state.title },
    });
  }
  return mcpSuccess(
    operation,
    "resumable",
    {
      sessionId: session.sessionId,
      task: { taskId: active.state.taskId, title: active.state.title },
      format: resume.format,
      resumePacket: resume.format === "json" ? resume.packet : resume.content,
    },
    [opened, ...resume.diagnostics],
  );
}
