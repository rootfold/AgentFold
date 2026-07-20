import {
  createAgentFoldIntegrationOperations,
  type AgentFoldIntegrationOperations,
} from "../application/integration-operations.js";
import type { AgentFoldMcpApplicationContext } from "./mcp-context.js";

export type AgentFoldMcpToolHandlers = AgentFoldIntegrationOperations;

export function createMcpToolHandlers(
  context: AgentFoldMcpApplicationContext,
): AgentFoldMcpToolHandlers {
  return createAgentFoldIntegrationOperations(context);
}
