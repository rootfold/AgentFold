import process from "node:process";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { FileSystem } from "../../core/filesystem/filesystem.js";
import type { GitInspector } from "../../core/git/git-inspector.js";
import type { GitRepositoryLocator } from "../../core/git/git-repository-locator.js";
import { createAgentFoldMcpServer } from "./create-mcp-server.js";
import { createMcpApplicationContext, type McpStderrLogger } from "./mcp-context.js";
import { InMemorySessionRegistry } from "./session-registry.js";

type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface McpSignalSource {
  once(signal: ShutdownSignal, listener: () => void): void;
  off(signal: ShutdownSignal, listener: () => void): void;
}

export interface RunMcpServerInput {
  readonly workspace?: string;
  readonly debug?: boolean;
  readonly version: string;
  readonly fileSystem: FileSystem;
  readonly gitRepositoryLocator: GitRepositoryLocator;
  readonly gitInspector: GitInspector;
  readonly logger: McpStderrLogger;
  readonly now?: () => Date;
  readonly generateSessionId?: () => string;
  readonly signalSource?: McpSignalSource;
  readonly transport?: Transport;
}

export async function runMcpServer(input: RunMcpServerInput): Promise<number> {
  const now = input.now ?? (() => new Date());
  const sessions = new InMemorySessionRegistry({
    now,
    ...(input.generateSessionId === undefined ? {} : { generateId: input.generateSessionId }),
  });
  const resolved = await createMcpApplicationContext({
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    version: input.version,
    fileSystem: input.fileSystem,
    gitRepositoryLocator: input.gitRepositoryLocator,
    gitInspector: input.gitInspector,
    sessions,
    now,
    debug: input.debug ?? false,
    logger: input.logger,
  });
  if (resolved.status === "error") {
    for (const diagnostic of resolved.diagnostics) {
      input.logger.error(`${diagnostic.code}: ${diagnostic.message}`);
    }
    return 6;
  }

  const server = createAgentFoldMcpServer({ context: resolved.context });
  const transport = input.transport ?? new StdioServerTransport();
  const signalSource = input.signalSource ?? process;
  let shuttingDown = false;
  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  server.server.onclose = () => resolveClosed?.();
  server.server.onerror = (error) => {
    input.logger.debug(`Transport warning: ${error.message}`);
  };
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    input.logger.debug(`Shutting down after ${reason}.`);
    try {
      await server.close();
    } catch {
      input.logger.error("AFMCP015: MCP shutdown did not complete cleanly.");
      resolveClosed?.();
    }
  };
  const onSigint = (): void => void shutdown("SIGINT");
  const onSigterm = (): void => void shutdown("SIGTERM");
  signalSource.once("SIGINT", onSigint);
  signalSource.once("SIGTERM", onSigterm);

  try {
    await server.connect(transport);
    input.logger.debug("MCP stdio server started.");
    await closed;
    return 0;
  } catch {
    input.logger.error("AFMCP001: MCP stdio server failed to start safely.");
    await shutdown("startup failure");
    return 1;
  } finally {
    signalSource.off("SIGINT", onSigint);
    signalSource.off("SIGTERM", onSigterm);
  }
}
