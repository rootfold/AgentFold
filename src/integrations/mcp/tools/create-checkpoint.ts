import {
  commitCheckpoint,
  prepareCheckpoint,
} from "../../../core/checkpoints/create-checkpoint.js";
import type { Checkpoint } from "../../../core/checkpoints/types.js";
import { containsSecretLikeText } from "../../../core/reports/redact-secrets.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, mcpSuccess, type AgentFoldMcpResult } from "../mcp-response.js";
import { agentFoldMcpToolNames } from "../tool-names.js";
import { createCheckpointInputSchema } from "../tool-schemas.js";
import {
  coreDependencies,
  diagnostic,
  parseToolInput,
  requireOpenSession,
  writer,
} from "./shared.js";

function checkpointData(checkpoint: Checkpoint) {
  const paths = checkpoint.observedGit.changedPaths;
  return {
    taskId: checkpoint.taskId,
    checkpointId: checkpoint.checkpointId,
    fingerprint: checkpoint.fingerprint,
    semanticRevision: checkpoint.semanticRevision,
    semanticFreshness: checkpoint.semanticFreshness,
    changedPathCounts: {
      added: paths.added.length,
      modified: paths.modified.length,
      deleted: paths.deleted.length,
      renamed: paths.renamed.length,
      copied: paths.copied.length,
      untracked: paths.untracked.length,
      unmerged: paths.unmerged.length,
    },
    diffStatistics: checkpoint.observedGit.diffStatistics,
  };
}

export async function createCheckpoint(
  context: AgentFoldMcpApplicationContext,
  input: unknown,
): Promise<AgentFoldMcpResult> {
  const operation = agentFoldMcpToolNames.createCheckpoint;
  const parsed = parseToolInput(operation, createCheckpointInputSchema, input);
  if (!parsed.success) return parsed.result;
  if (parsed.data.agent !== undefined && containsSecretLikeText(parsed.data.agent)) {
    return mcpFailure(operation, "unsafe_identity", [
      diagnostic("AFMCP014", "error", "Secret-like content is not accepted in agent labels."),
    ]);
  }
  const session = requireOpenSession(context, operation, parsed.data.sessionId);
  if (!session.success) return session.result;
  const plan = await prepareCheckpoint(coreDependencies(context), {
    agent: parsed.data.agent ?? session.session.agent,
  });
  if (plan.status !== "ready" && plan.status !== "duplicate") {
    return mcpFailure(operation, plan.status, plan.diagnostics);
  }
  if (plan.status === "duplicate") {
    context.sessions.attachTask(parsed.data.sessionId, plan.checkpoint.taskId);
    return mcpSuccess(
      operation,
      "duplicate_checkpoint",
      {
        sessionId: parsed.data.sessionId,
        ...checkpointData(plan.checkpoint),
        created: false,
        duplicate: true,
      },
      [...plan.diagnostics, diagnostic("AFMCP009", "info", "Duplicate checkpoint skipped.")],
    );
  }
  if (parsed.data.dryRun) {
    context.sessions.attachTask(parsed.data.sessionId, plan.checkpoint.taskId);
    return mcpSuccess(
      operation,
      "dry_run",
      {
        sessionId: parsed.data.sessionId,
        ...checkpointData(plan.checkpoint),
        created: false,
        duplicate: false,
      },
      plan.diagnostics,
    );
  }
  const committed = await commitCheckpoint(plan, context.fileSystem, writer(context));
  if (committed.status !== "success") {
    return mcpFailure(operation, committed.status, committed.diagnostics);
  }
  context.sessions.attachTask(parsed.data.sessionId, plan.checkpoint.taskId);
  return mcpSuccess(
    operation,
    "checkpoint_created",
    {
      sessionId: parsed.data.sessionId,
      ...checkpointData(plan.checkpoint),
      created: true,
      duplicate: false,
    },
    [
      ...committed.diagnostics,
      diagnostic("AFMCP008", "success", "Checkpoint created through MCP."),
    ],
  );
}
